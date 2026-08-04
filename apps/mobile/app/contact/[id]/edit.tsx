import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import { CompanyPickerField } from "@/components/contact/CompanyPickerField";
import { ContactAddressesEditor } from "@/components/contact/ContactAddressesEditor";
import { ContactPhonesEditor } from "@/components/contact/ContactPhonesEditor";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { usersApi, type TeamUser } from "@/lib/api/users";
import {
  CONTACT_CLIENT_TYPE_OPTIONS,
  CONTACT_REGION_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  contactNextActionOptions,
  contactStageOptions,
} from "@/lib/contact-options";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact, ContactClientStage } from "@/types/crm";

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function EditContactScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token, user } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [addressInfo, setAddressInfo] = useState("");
  const [clientType, setClientType] = useState("");
  const [status, setStatus] = useState("");
  const [clientStage, setClientStage] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [externalCode, setExternalCode] = useState("");
  const [documentDisplayName, setDocumentDisplayName] = useState("");
  const [marketingCallOptOut, setMarketingCallOptOut] = useState(false);
  const [nextActionType, setNextActionType] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [additionalPhones, setAdditionalPhones] = useState<
    { id: string; phone: string; label?: string | null }[]
  >([]);
  const [owners, setOwners] = useState<TeamUser[]>([]);
  const [ownerSheetOpen, setOwnerSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canEditOwner = Boolean(user && user.role !== "MANAGER");

  const applyContact = useCallback((c: Contact) => {
    setContact(c);
    setFirstName(c.firstName ?? "");
    setLastName(c.lastName ?? "");
    setMiddleName(c.middleName ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setPosition(c.position ?? "");
    setRegion(c.region ?? "");
    setCity(c.city ?? "");
    setAddress(c.address ?? "");
    setAddressInfo(c.addressInfo ?? "");
    setClientType(c.clientType ?? "");
    setStatus(c.status ?? "");
    setClientStage(c.clientStage ?? "");
    setCompanyId(c.companyId ?? c.company?.id ?? null);
    setCompanyName(c.company?.name ?? null);
    setOwnerId(c.ownerId ?? c.owner?.id ?? null);
    setExternalCode(c.externalCode ?? "");
    setDocumentDisplayName(c.documentDisplayName ?? "");
    setMarketingCallOptOut(Boolean(c.marketingCallOptOut));
    setNextActionType(c.nextActionType ?? "");
    setNextActionAt(c.nextActionAt ? c.nextActionAt.slice(0, 16) : "");
    setNextActionNote(c.nextActionNote ?? "");
    setAdditionalPhones(c.phones ?? []);
  }, []);

  const load = useCallback(async () => {
    if (!token || !contactId) return;
    setLoading(true);
    try {
      const c = await contactsApi.getById(token, contactId);
      applyContact(c);
      const phonesRes = await contactsApi.getPhones(token, contactId).catch(() => null);
      if (phonesRes) {
        setAdditionalPhones(phonesRes.additional ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [token, contactId, applyContact]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !canEditOwner) return;
    void usersApi
      .list(token)
      .then(setOwners)
      .catch(() => setOwners([]));
  }, [token, canEditOwner]);

  async function onSave() {
    if (!token || !contactId) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      Alert.alert(t("common.error"), t("clients.validationRequired"));
      return;
    }
    setBusy(true);
    try {
      await contactsApi.patch(token, contactId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: emptyToNull(middleName),
        phone: phone.trim(),
        email: emptyToNull(email),
        position: emptyToNull(position),
        region: emptyToNull(region),
        city: emptyToNull(city),
        address: emptyToNull(address),
        addressInfo: emptyToNull(addressInfo),
        clientType: emptyToNull(clientType),
        status: emptyToNull(status),
        companyId,
        ownerId: canEditOwner ? ownerId : undefined,
        externalCode: emptyToNull(externalCode),
        documentDisplayName: emptyToNull(documentDisplayName),
        marketingCallOptOut,
        lat: contact?.lat ?? null,
        lng: contact?.lng ?? null,
        googlePlaceId: contact?.googlePlaceId ?? null,
      });

      const stageValue = (clientStage || null) as ContactClientStage | null;
      if ((contact?.clientStage ?? null) !== stageValue) {
        await contactsApi.updateStage(token, contactId, stageValue);
      }

      let nextAtIso: string | null = null;
      if (nextActionAt.trim() && nextActionType && nextActionType !== "NO_ACTION") {
        const parsed = new Date(nextActionAt.trim());
        if (Number.isNaN(parsed.getTime())) {
          Alert.alert(t("common.error"), t("clients.nextActionAtInvalid"));
          return;
        }
        nextAtIso = parsed.toISOString();
      }
      await contactsApi.updateNextAction(token, contactId, {
        nextActionType: emptyToNull(nextActionType),
        nextActionAt: nextAtIso,
        nextActionNote: emptyToNull(nextActionNote),
      });

      Alert.alert(t("common.done"), t("contacts.saved"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !contact) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
            {t("common.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  const ownerLabel =
    owners.find((o) => o.id === ownerId)?.fullName ||
    contact.owner?.fullName ||
    (ownerId ? ownerId : t("clients.ownerNone"));

  return (
    <Screen padded={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: theme.spacing.lg }]}>
        <SectionTitle title={t("clients.sectionIdentity")} />
        <TextField
          label={t("clients.firstName")}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t("clients.firstNameRequired")}
        />
        <TextField
          label={t("clients.lastName")}
          value={lastName}
          onChangeText={setLastName}
          placeholder={t("clients.lastNameRequired")}
        />
        <TextField
          label={t("clients.middleName")}
          value={middleName}
          onChangeText={setMiddleName}
          placeholder={t("clients.middleName")}
        />
        <TextField
          label={t("clients.phone")}
          value={phone}
          onChangeText={setPhone}
          placeholder={t("clients.phoneRequiredField")}
          keyboardType="phone-pad"
        />
        {token && contactId ? (
          <ContactPhonesEditor
            token={token}
            contactId={contactId}
            primaryPhone={phone}
            additional={additionalPhones}
            onChanged={() => void load()}
            disabled={busy}
          />
        ) : null}
        <TextField
          label={t("clients.email")}
          value={email}
          onChangeText={setEmail}
          placeholder={t("clients.email")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label={t("clients.position")}
          value={position}
          onChangeText={setPosition}
          placeholder={t("clients.position")}
        />

        <SectionTitle title={t("clients.sectionLocation")} />
        <SelectField
          label={t("clients.region")}
          value={region}
          options={CONTACT_REGION_OPTIONS}
          onChange={setRegion}
        />
        <TextField label={t("clients.city")} value={city} onChangeText={setCity} placeholder={t("clients.city")} />
        <TextField
          label={t("clients.address")}
          value={address}
          onChangeText={setAddress}
          placeholder={t("clients.address")}
          multiline
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <TextField
          label={t("clients.addressInfo")}
          value={addressInfo}
          onChangeText={setAddressInfo}
          placeholder={t("clients.addressInfo")}
        />
        {token && contactId ? (
          <ContactAddressesEditor token={token} contactId={contactId} disabled={busy} />
        ) : null}

        <SectionTitle title={t("clients.sectionCrm")} />
        <SelectField
          label={t("clients.clientType")}
          value={clientType}
          options={CONTACT_CLIENT_TYPE_OPTIONS}
          onChange={setClientType}
        />
        <SelectField
          label={t("clients.status")}
          value={status}
          options={CONTACT_STATUS_OPTIONS}
          onChange={setStatus}
        />
        <SelectField
          label={t("clients.stage")}
          value={clientStage}
          options={contactStageOptions()}
          onChange={setClientStage}
        />
        {token ? (
          <CompanyPickerField
            token={token}
            companyId={companyId}
            companyName={companyName}
            onChange={(c) => {
              setCompanyId(c?.id ?? null);
              setCompanyName(c?.name ?? null);
            }}
            disabled={busy}
          />
        ) : null}
        {canEditOwner ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[theme.typography.caption, { fontWeight: "600", marginBottom: 6 }]}>
              {t("clients.owner")}
            </Text>
            <Pressable
              onPress={() => setOwnerSheetOpen(true)}
              style={[
                styles.selectLike,
                { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
              ]}>
              <Text style={[theme.typography.body, { color: theme.colors.text }]} numberOfLines={1}>
                {ownerLabel}
              </Text>
            </Pressable>
            <BottomSheet
              visible={ownerSheetOpen}
              onClose={() => setOwnerSheetOpen(false)}
              title={t("clients.owner")}>
              <Pressable
                onPress={() => {
                  setOwnerId(null);
                  setOwnerSheetOpen(false);
                }}
                style={[styles.option, { borderColor: theme.colors.border }]}>
                <Text style={theme.typography.body}>{t("clients.ownerNone")}</Text>
              </Pressable>
              {owners.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    setOwnerId(o.id);
                    setOwnerSheetOpen(false);
                  }}
                  style={[
                    styles.option,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: o.id === ownerId ? theme.colors.chipOn : "transparent",
                    },
                  ]}>
                  <Text style={theme.typography.body}>{o.fullName || o.email}</Text>
                </Pressable>
              ))}
            </BottomSheet>
          </View>
        ) : null}

        <SectionTitle title={t("clients.sectionNextAction")} />
        <SelectField
          label={t("clients.nextActionType")}
          value={nextActionType}
          options={contactNextActionOptions()}
          onChange={setNextActionType}
        />
        <TextField
          label={t("clients.nextActionAt")}
          value={nextActionAt}
          onChangeText={setNextActionAt}
          placeholder="YYYY-MM-DDTHH:mm"
          autoCapitalize="none"
        />
        <TextField
          label={t("clients.nextActionNote")}
          value={nextActionNote}
          onChangeText={setNextActionNote}
          placeholder={t("clients.nextActionNote")}
          multiline
          style={{ minHeight: 72, textAlignVertical: "top" }}
        />

        <SectionTitle title={t("clients.sectionDocs")} />
        <TextField
          label={t("clients.externalCode")}
          value={externalCode}
          onChangeText={setExternalCode}
          placeholder={t("clients.externalCode")}
        />
        <TextField
          label={t("clients.documentDisplayName")}
          value={documentDisplayName}
          onChangeText={setDocumentDisplayName}
          placeholder={t("clients.documentDisplayName")}
        />
        <View style={styles.switchRow}>
          <Text style={[theme.typography.body, { flex: 1 }]}>{t("clients.marketingCallOptOut")}</Text>
          <Switch
            value={marketingCallOptOut}
            onValueChange={setMarketingCallOptOut}
            disabled={busy}
          />
        </View>

        <AppButton
          label={t("common.save")}
          onPress={() => void onSave()}
          loading={busy}
          fullWidth
          style={{ marginTop: theme.spacing.sm, marginBottom: theme.spacing.xxxl }}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { paddingTop: 8 },
  selectLike: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
});
