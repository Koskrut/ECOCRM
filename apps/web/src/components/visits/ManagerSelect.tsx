"use client";

export type ManagerSelectUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type ManagerSelectProps = {
  users: ManagerSelectUser[];
  value: string;
  onChange: (ownerId: string) => void;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
  id?: string;
};

export function ManagerSelect({
  users,
  value,
  onChange,
  includeAllOption = true,
  allOptionLabel = "Усі менеджери",
  className = "",
  id = "manager-select",
}: ManagerSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ${className}`}>
      {includeAllOption ? <option value="">{allOptionLabel}</option> : null}
      {users
        .filter((u) => u.role === "MANAGER" || u.role === "LEAD" || u.role === "USER")
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName || u.email}
          </option>
        ))}
    </select>
  );
}
