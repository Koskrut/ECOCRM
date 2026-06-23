import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type {
  SystemUpdateApplyRequestDto,
  SystemUpdateJobDto,
  SystemUpdatePreflightDto,
  SystemUpdateStatusDto,
  UpdateJobStatus,
  UpdateMode,
  UpdateState,
} from "./dto/system-update.dto";

type CpUpdateStatusResponse = {
  latestVersion?: string | null;
  targetVersion?: string | null;
};

type AgentStatusResponse = {
  ok?: boolean;
  activeJobId?: string | null;
};

type AgentPreflightResponse = {
  ok?: boolean;
  message?: string;
  details?: Record<string, unknown>;
  suggestedVersion?: string | null;
};

type AgentApplyResponse = {
  id?: string;
  status?: UpdateJobStatus;
  message?: string;
  backupPath?: string | null;
  logTail?: string[];
};

type AgentJobResponse = {
  id?: string;
  status?: UpdateJobStatus;
  message?: string;
  backupPath?: string | null;
  createdAt?: string;
  updatedAt?: string;
  logTail?: string[];
  fromVersion?: string | null;
  toVersion?: string | null;
  requestedBy?: string;
};

function trimOrNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

@Injectable()
export class SystemUpdateService {
  private activeJobId: string | null = null;
  private lastJobId: string | null = null;

  private readonly updaterUrl = trimOrNull(process.env.UPDATER_AGENT_URL);
  private readonly updaterToken = trimOrNull(process.env.UPDATER_AGENT_TOKEN);
  private readonly cpUpdateStatusUrl = trimOrNull(process.env.CONTROL_PLANE_UPDATE_STATUS_URL);

  async getStatus(): Promise<SystemUpdateStatusDto> {
    const currentVersion = trimOrNull(process.env.CRM_RELEASE_VERSION);
    const mode: UpdateMode = this.updaterUrl ? "agent_available" : "operator_only";

    const [cpStatus, updaterState] = await Promise.all([this.loadCpStatus(), this.loadUpdaterState()]);
    const updaterReachable = updaterState.reachable;
    if (updaterReachable) {
      this.activeJobId = updaterState.activeJobId;
      if (updaterState.activeJobId) this.lastJobId = updaterState.activeJobId;
    }
    const latestVersion = cpStatus.latestVersion;
    const targetVersion = cpStatus.targetVersion;

    let state: UpdateState = "idle";
    let canUpdate = false;
    let reason = "Updates are performed manually by the server operator.";
    if (mode === "agent_available") {
      reason = "Updater agent is configured.";
      if (!updaterReachable) {
        reason = "Updater agent is unavailable.";
      } else if (this.activeJobId) {
        state = "updating";
        reason = "Update is already running.";
      } else if (!cpStatus.reachable) {
        reason = "Control Plane is unavailable.";
      } else if (targetVersion && currentVersion && targetVersion !== currentVersion) {
        state = "update_available";
        canUpdate = true;
        reason = `Target release ${targetVersion} is available.`;
      } else if (targetVersion && !currentVersion) {
        state = "update_available";
        canUpdate = true;
        reason = `Target release ${targetVersion} is available.`;
      } else if (targetVersion && currentVersion && targetVersion === currentVersion) {
        state = "up_to_date";
        reason = "Current release matches Control Plane target release.";
      } else {
        reason = "No target release is available.";
      }
    }

    const autoUpdateEnabled = process.env.AUTO_UPDATE_ENABLED === "true";

    return {
      mode,
      state,
      currentVersion,
      latestVersion,
      targetVersion,
      canUpdate,
      reason,
      cpReachable: cpStatus.reachable,
      updaterReachable,
      autoUpdateEnabled,
      activeJobId: this.activeJobId,
      lastJobId: this.lastJobId,
    };
  }

  async tryAutoApply(): Promise<SystemUpdateJobDto | null> {
    if (process.env.AUTO_UPDATE_ENABLED !== "true") return null;

    const status = await this.getStatus();
    if (!status.canUpdate || status.activeJobId) return null;

    const preflight = await this.preflight();
    if (!preflight.ok) return null;

    return this.apply("auto-update", {});
  }

  async preflight(): Promise<SystemUpdatePreflightDto> {
    if (!this.updaterUrl) {
      return {
        ok: false,
        message: "Updater agent is not configured.",
        details: {},
        suggestedVersion: null,
      };
    }
    try {
      const response = await fetch(`${this.updaterUrl}/preflight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(this.updaterToken),
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        return {
          ok: false,
          message: `Preflight failed with HTTP ${response.status}.`,
          details: {},
          suggestedVersion: null,
        };
      }
      const data = (await response.json()) as AgentPreflightResponse;
      return {
        ok: Boolean(data.ok),
        message: data.message ?? (data.ok ? "Preflight passed." : "Preflight failed."),
        details: data.details ?? {},
        suggestedVersion: trimOrNull(data.suggestedVersion ?? undefined),
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Unable to run preflight.",
        details: {},
        suggestedVersion: null,
      };
    }
  }

  async apply(requestedBy: string, request: SystemUpdateApplyRequestDto): Promise<SystemUpdateJobDto> {
    if (!this.updaterUrl) {
      throw new ServiceUnavailableException("Updater agent is not configured.");
    }

    const status = await this.getStatus();
    if (status.activeJobId) {
      throw new ConflictException("Update is already running.");
    }

    if (!status.canUpdate && !request.targetVersion) {
      throw new BadRequestException(status.reason);
    }

    const targetVersion = request.targetVersion ?? status.targetVersion;
    if (!targetVersion) {
      throw new BadRequestException("No target version available.");
    }

    const response = await fetch(`${this.updaterUrl}/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(this.updaterToken),
      },
      body: JSON.stringify({ targetVersion }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`Updater apply failed with HTTP ${response.status}.`);
    }
    const data = (await response.json()) as AgentApplyResponse;
    const now = new Date().toISOString();
    const id = trimOrNull(data.id ?? undefined) ?? `job-${Date.now()}`;
    const dto: SystemUpdateJobDto = {
      id,
      status: data.status ?? "queued",
      createdAt: now,
      updatedAt: now,
      requestedBy,
      fromVersion: status.currentVersion,
      toVersion: targetVersion,
      backupPath: trimOrNull(data.backupPath ?? undefined),
      message: data.message ?? "Update started.",
      logTail: Array.isArray(data.logTail) ? data.logTail.map(String) : [],
    };
    this.activeJobId = id;
    this.lastJobId = id;
    if (dto.status === "failed" || dto.status === "succeeded") {
      this.activeJobId = null;
    }
    return dto;
  }

  async getJob(jobId: string): Promise<SystemUpdateJobDto | null> {
    if (!this.updaterUrl) return null;
    try {
      const response = await fetch(`${this.updaterUrl}/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: authHeaders(this.updaterToken),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as AgentJobResponse;
      const dto: SystemUpdateJobDto = {
        id: trimOrNull(data.id ?? undefined) ?? jobId,
        status: data.status ?? "running",
        createdAt: trimOrNull(data.createdAt ?? undefined) ?? new Date().toISOString(),
        updatedAt: trimOrNull(data.updatedAt ?? undefined) ?? new Date().toISOString(),
        requestedBy: trimOrNull(data.requestedBy ?? undefined) ?? "unknown",
        fromVersion: trimOrNull(data.fromVersion ?? undefined),
        toVersion: trimOrNull(data.toVersion ?? undefined),
        backupPath: trimOrNull(data.backupPath ?? undefined),
        message: data.message ?? "",
        logTail: Array.isArray(data.logTail) ? data.logTail.map(String) : [],
      };
      if (dto.status === "failed" || dto.status === "succeeded") {
        this.activeJobId = this.activeJobId === dto.id ? null : this.activeJobId;
      }
      this.lastJobId = dto.id;
      return dto;
    } catch {
      return null;
    }
  }

  private async loadUpdaterState(): Promise<{ reachable: boolean; activeJobId: string | null }> {
    if (!this.updaterUrl) return { reachable: false, activeJobId: null };
    try {
      const response = await fetch(`${this.updaterUrl}/status`, {
        method: "GET",
        headers: authHeaders(this.updaterToken),
      });
      if (!response.ok) return { reachable: false, activeJobId: null };
      const data = (await response.json()) as AgentStatusResponse;
      return {
        reachable: data.ok !== false,
        activeJobId: trimOrNull(data.activeJobId ?? undefined),
      };
    } catch {
      return { reachable: false, activeJobId: null };
    }
  }

  private async loadCpStatus(): Promise<{
    reachable: boolean;
    latestVersion: string | null;
    targetVersion: string | null;
  }> {
    const installationId = trimOrNull(process.env.CONTROL_PLANE_INSTALLATION_ID);
    const token =
      trimOrNull(process.env.CONTROL_PLANE_TOKEN) ?? trimOrNull(process.env.CONTROL_PLANE_INSTALLATION_TOKEN);
    let url = this.cpUpdateStatusUrl;
    if (!url && installationId && trimOrNull(process.env.CONTROL_PLANE_URL)) {
      const base = String(process.env.CONTROL_PLANE_URL).replace(/\/+$/, "");
      url = `${base}/api/installations/${encodeURIComponent(installationId)}/updates/status`;
    }
    if (!url) {
      return { reachable: false, latestVersion: null, targetVersion: null };
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...authHeaders(token),
        },
      });
      if (!response.ok) return { reachable: false, latestVersion: null, targetVersion: null };
      const data = (await response.json()) as CpUpdateStatusResponse;
      return {
        reachable: true,
        latestVersion: trimOrNull(data.latestVersion ?? undefined),
        targetVersion: trimOrNull(data.targetVersion ?? undefined),
      };
    } catch {
      return { reachable: false, latestVersion: null, targetVersion: null };
    }
  }
}
