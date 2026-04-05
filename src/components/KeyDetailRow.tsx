import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { colors, spacing } from '../constants/theme';

interface KeyDetailRowProps {
  label: string;
  value: string;
}

function isUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function KeyDetailRow({ label, value }: KeyDetailRowProps) {
  const valueIsUrl = isUrl(value);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {valueIsUrl ? (
        <Pressable onPress={() => Linking.openURL(value)} style={styles.valueContainer}>
          <Text style={styles.linkValue} numberOfLines={1}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={styles.value}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: '600',
    width: 100,
    flexShrink: 0,
  },
  valueContainer: {
    flex: 1,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  linkValue: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
  },
});
