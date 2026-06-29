import { BlurView } from "expo-blur";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { useKeyboardHeight } from "@/lib/use-keyboard-height";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function BottomSheet({ visible, onClose, title, children, style }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose} />
        <View
          style={[
            styles.sheetWrap,
            { paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "android" ? keyboardHeight : 0) },
          ]}>
          <BlurView
            intensity={theme.scheme === "dark" ? 48 : 72}
            tint={theme.scheme}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surfaceGlass,
                borderColor: theme.colors.border,
              },
              style,
            ]}>
            <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
            {title ? <Text style={[theme.typography.section, styles.title]}>{title}</Text> : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}>
              {children}
            </ScrollView>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  title: { marginBottom: 12 },
});
