import React from 'react';
import { FontAwesome5 } from '@expo/vector-icons';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  solid?: boolean;
}

export default function Icon({ name, size = 16, color = '#fff', solid = true }: IconProps) {
  return <FontAwesome5 name={name} size={size} color={color} solid={solid} />;
}
