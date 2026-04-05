import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';

interface DendriteLineProps {
  height?: number | string;
  color?: string;
  opacity?: number;
}

interface DendriteNodeProps {
  color?: string;
  size?: number;
}

interface DendriteBranchProps {
  width?: number;
  color?: string;
}

/** Vertical backbone line running down the left side */
export function DendriteLine({ height = '100%', color = colors.accent, opacity = 0.1 }: DendriteLineProps) {
  return (
    <View
      style={[
        styles.line,
        {
          height: height as any,
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  );
}

/** Junction dot — the synapse itself */
export function DendriteNode({ color = colors.accent, size = 5 }: DendriteNodeProps) {
  return (
    <View
      style={[
        styles.node,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          // offset to center on the line (line is at left:20, node is size px wide)
          left: 20 - size / 2,
        },
      ]}
    />
  );
}

/** Short horizontal branch from line to card */
export function DendriteBranch({ width = 14, color = colors.accent }: DendriteBranchProps) {
  return (
    <View
      style={[
        styles.branch,
        {
          width,
          backgroundColor: color,
          // starts after the node (left:22 = line(20) + half-node(2) + gap)
          left: 22,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    left: 20,
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  node: {
    position: 'absolute',
    top: '50%' as any,
    opacity: 0.28,
  },
  branch: {
    position: 'absolute',
    top: '50%' as any,
    height: StyleSheet.hairlineWidth,
    opacity: 0.14,
  },
});
