import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "crm_manager_jwt";

export async function getAuthToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}
