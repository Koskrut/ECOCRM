import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { npApi } from "@/lib/api/np";
import { shippingProfilesApi } from "@/lib/api/shipping-profiles";
import type {
  Contact,
  ContactShippingProfile,
  CreateShippingProfileBody,
  NpDeliveryType,
} from "@/types/crm";

function profileSummary(p: ContactShippingProfile): string {
  const parts: string[] = [];
  if (p.cityName) parts.push(p.cityName);
  if (p.warehouseNumber) parts.push(`№${p.warehouseNumber}`);
  else if (p.streetName) parts.push(`${p.streetName}${p.building ? ` ${p.building}` : ""}`);
  return parts.join(", ") || p.deliveryType;
}

type ShippingProfilePickerProps = {
  token: string;
  contact: Contact;
  selectedProfileId: string | null;
  onSelectProfileId: (id: string | null) => void;
};

export function ShippingProfilePicker({
  token,
  contact,
  selectedProfileId,
  onSelectProfileId,
}: ShippingProfilePickerProps) {
  const [profiles, setProfiles] = useState<ContactShippingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [label, setLabel] = useState("Основна");
  const [deliveryType, setDeliveryType] = useState<NpDeliveryType>("WAREHOUSE");
  const [firstName, setFirstName] = useState(contact.firstName ?? "");
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");

  const [cityQuery, setCityQuery] = useState("");
  const [cityRef, setCityRef] = useState("");
  const [cityName, setCityName] = useState("");
  const [cityResults, setCityResults] = useState<Array<{ ref: string; description: string }>>([]);

  const [whQuery, setWhQuery] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [warehouseNumber, setWarehouseNumber] = useState("");
  const [warehouseLabel, setWarehouseLabel] = useState("");
  const [whResults, setWhResults] = useState<
    Array<{ ref: string; description: string; number?: string | null }>
  >([]);

  const [streetQuery, setStreetQuery] = useState("");
  const [streetRef, setStreetRef] = useState("");
  const [streetName, setStreetName] = useState("");
  const [building, setBuilding] = useState("");
  const [flat, setFlat] = useState("");
  const [streetResults, setStreetResults] = useState<Array<{ ref: string; description: string }>>(
    [],
  );

  const reload = useCallback(async () => {
    if (!token || !contact.id) return;
    setLoading(true);
    try {
      const res = await shippingProfilesApi.list(token, contact.id);
      const items = res.items ?? [];
      setProfiles(items);
      if (!selectedProfileId) {
        const def = items.find((p) => p.isDefault) ?? items[0];
        if (def) onSelectProfileId(def.id);
      }
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [token, contact.id, selectedProfileId, onSelectProfileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setFirstName(contact.firstName ?? "");
    setLastName(contact.lastName ?? "");
    setPhone(contact.phone ?? "");
  }, [contact]);

  useEffect(() => {
    const q = cityQuery.trim();
    if (!token || q.length < 2) {
      setCityResults([]);
      return;
    }
    const id = setTimeout(() => {
      void npApi.cities(token, q).then((res) => setCityResults(res.items ?? []));
    }, 300);
    return () => clearTimeout(id);
  }, [token, cityQuery]);

  useEffect(() => {
    if (!token || !cityRef) {
      setWhResults([]);
      return;
    }
    const id = setTimeout(() => {
      void npApi
        .warehouses(token, {
          cityRef,
          q: whQuery.trim(),
          type: deliveryType === "POSTOMAT" ? "POSTOMAT" : "WAREHOUSE",
        })
        .then((res) => setWhResults(res.items ?? []));
    }, 300);
    return () => clearTimeout(id);
  }, [token, cityRef, whQuery, deliveryType]);

  useEffect(() => {
    const q = streetQuery.trim();
    if (!token || !cityRef || q.length < 3) {
      setStreetResults([]);
      return;
    }
    const id = setTimeout(() => {
      void npApi.streets(token, { cityRef, q }).then((res) => setStreetResults(res.items ?? []));
    }, 300);
    return () => clearTimeout(id);
  }, [token, cityRef, streetQuery]);

  async function onCreateProfile() {
    if (!token) return;
    const body: CreateShippingProfileBody = {
      label: label.trim() || "Адреса",
      recipientType: "PERSON",
      deliveryType,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      phone: phone.trim() || undefined,
      cityRef: cityRef || undefined,
      cityName: cityName || undefined,
      warehouseRef: warehouseRef || undefined,
      warehouseNumber: warehouseNumber || undefined,
      warehouseType: deliveryType === "POSTOMAT" ? "POSTOMAT" : deliveryType === "WAREHOUSE" ? "WAREHOUSE" : undefined,
      streetRef: streetRef || undefined,
      streetName: streetName || undefined,
      building: building.trim() || undefined,
      flat: flat.trim() || undefined,
      isDefault: profiles.length === 0,
    };
    if (!body.cityRef) return;
    if (deliveryType === "ADDRESS" && !body.streetRef) return;
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !body.warehouseRef) return;

    setCreating(true);
    try {
      const res = await shippingProfilesApi.create(token, contact.id, body);
      setShowForm(false);
      await reload();
      if (res.item?.id) onSelectProfileId(res.item.id);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View>
      {profiles.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onSelectProfileId(p.id)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.profileRow,
            selectedProfileId === p.id && styles.profileRowSelected,
            pressed && { opacity: 0.75 },
          ]}>
          <Text style={styles.profileLabel}>{p.label}</Text>
          <Text style={styles.profileMeta}>{profileSummary(p)}</Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => setShowForm((v) => !v)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}>
        <Text style={styles.linkText}>{showForm ? "Сховати форму" : "+ Нова адреса НП"}</Text>
      </Pressable>

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Новий профіль доставки</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Назва (напр. Дім, Клініка)"
            placeholderTextColor="#888"
            style={styles.input}
          />
          <View style={styles.typeRow}>
            {(["WAREHOUSE", "POSTOMAT", "ADDRESS"] as NpDeliveryType[]).map((dt) => (
              <Pressable
                key={dt}
                onPress={() => setDeliveryType(dt)}
                style={[styles.typeChip, deliveryType === dt && styles.typeChipActive]}>
                <Text style={[styles.typeChipText, deliveryType === dt && styles.typeChipTextActive]}>
                  {dt === "WAREHOUSE" ? "Відділення" : dt === "POSTOMAT" ? "Поштомат" : "Адреса"}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Прізвище"
            placeholderTextColor="#888"
            style={styles.input}
          />
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Ім'я"
            placeholderTextColor="#888"
            style={styles.input}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Телефон"
            placeholderTextColor="#888"
            style={styles.input}
            keyboardType="phone-pad"
          />

          <TextInput
            value={cityQuery || cityName}
            onChangeText={(v) => {
              setCityQuery(v);
              setCityRef("");
              setCityName("");
            }}
            placeholder="Місто (мін. 2 символи)"
            placeholderTextColor="#888"
            style={styles.input}
          />
          {cityResults.map((c) => (
            <Pressable
              key={c.ref}
              onPress={() => {
                setCityRef(c.ref);
                setCityName(c.description);
                setCityQuery(c.description);
                setCityResults([]);
              }}
              style={styles.pickRow}>
              <Text>{c.description}</Text>
            </Pressable>
          ))}

          {deliveryType === "ADDRESS" ? (
            <>
              <TextInput
                value={streetQuery || streetName}
                onChangeText={(v) => {
                  setStreetQuery(v);
                  setStreetRef("");
                  setStreetName("");
                }}
                placeholder="Вулиця (мін. 3 символи)"
                placeholderTextColor="#888"
                style={styles.input}
              />
              {streetResults.map((s) => (
                <Pressable
                  key={s.ref}
                  onPress={() => {
                    setStreetRef(s.ref);
                    setStreetName(s.description);
                    setStreetQuery(s.description);
                    setStreetResults([]);
                  }}
                  style={styles.pickRow}>
                  <Text>{s.description}</Text>
                </Pressable>
              ))}
              <TextInput
                value={building}
                onChangeText={setBuilding}
                placeholder="Будинок"
                placeholderTextColor="#888"
                style={styles.input}
              />
              <TextInput
                value={flat}
                onChangeText={setFlat}
                placeholder="Квартира"
                placeholderTextColor="#888"
                style={styles.input}
              />
            </>
          ) : cityRef ? (
            <>
              <TextInput
                value={whQuery || warehouseLabel}
                onChangeText={setWhQuery}
                placeholder="Відділення (номер або адреса)"
                placeholderTextColor="#888"
                style={styles.input}
              />
              {whResults.map((w) => (
                <Pressable
                  key={w.ref}
                  onPress={() => {
                    setWarehouseRef(w.ref);
                    setWarehouseNumber(w.number ?? "");
                    setWarehouseLabel(w.number ? `№${w.number}` : w.description);
                    setWhQuery("");
                    setWhResults([]);
                  }}
                  style={styles.pickRow}>
                  <Text>
                    {w.number ? `№${w.number}` : ""} {w.description}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}

          <Pressable
            disabled={creating}
            onPress={() => void onCreateProfile()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.saveBtn, (creating || pressed) && { opacity: 0.75 }]}>
            <Text style={styles.saveBtnText}>{creating ? "…" : "Зберегти профіль"}</Text>
          </Pressable>
        </View>
      ) : null}

      {profiles.length === 0 && !showForm ? (
        <Text style={styles.hint}>Немає збережених адрес. Додайте профіль доставки.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: 16, alignItems: "center" },
  profileRow: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  profileRowSelected: { borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.08)" },
  profileLabel: { fontWeight: "700", fontSize: 15 },
  profileMeta: { marginTop: 4, opacity: 0.75, fontSize: 13 },
  linkBtn: { marginTop: 4, marginBottom: 8, alignSelf: "flex-start" },
  linkText: { color: "#2563eb", fontWeight: "600" },
  form: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  formTitle: { fontWeight: "700", marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(120,120,128,0.12)",
  },
  typeChipActive: { backgroundColor: "#2563eb" },
  typeChipText: { fontSize: 13, fontWeight: "600" },
  typeChipTextActive: { color: "#fff" },
  pickRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  saveBtn: {
    marginTop: 4,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "600" },
  hint: { opacity: 0.7, marginTop: 4 },
});
