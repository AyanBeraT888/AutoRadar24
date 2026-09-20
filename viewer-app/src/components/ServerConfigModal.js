/**
 * Server Configuration Modal
 * Allows passenger to easily toggle between Emulator loopback (10.0.2.2:3000),
 * localhost, or custom LAN IP (for physical devices).
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import colors from '../theme/colors';

export default function ServerConfigModal({ visible, currentUrl, onClose, onSave }) {
  const [urlInput, setUrlInput] = useState(currentUrl);

  const handleSave = () => {
    if (urlInput.trim()) {
      onSave(urlInput.trim());
    }
  };

  const handleQuickPreset = (preset) => {
    setUrlInput(preset);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Configure Backend Server</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Specify the Auto 24 backend server URL to connect this viewer app.
          </Text>

          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://10.0.2.2:3000"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.quickLabel}>Quick Presets:</Text>
          <View style={styles.presetsRow}>
            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => handleQuickPreset('http://10.0.2.2:3000')}
            >
              <Text style={styles.presetText}>Android Emulator</Text>
              <Text style={styles.presetSub}>10.0.2.2:3000</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => handleQuickPreset('http://localhost:3000')}
            >
              <Text style={styles.presetText}>Localhost</Text>
              <Text style={styles.presetSub}>localhost:3000</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeBtn: {
    fontSize: 20,
    color: colors.textSecondary,
    fontWeight: 'bold',
  },
  desc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 16,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandGold,
  },
  presetSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.brandGold,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
});
