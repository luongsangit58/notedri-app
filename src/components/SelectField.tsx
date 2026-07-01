import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TextInput, Pressable } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

type Option = { code: string; name: string };

/** Dropdown chọn 1 mục (có ô tìm kiếm), dùng cho tỉnh/phường... */
export default function SelectField({
  value, placeholder, options, onSelect, disabled, style,
}: {
  value?: string;                 // tên đang chọn
  placeholder: string;
  options: Option[];
  onSelect: (opt: Option) => void;
  disabled?: boolean;
  style?: any;
}) {
  const colors = useColors();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter(o => o.name.toLowerCase().includes(s)) : options;
  }, [q, options]);

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => { setQ(''); setOpen(true); }}
        style={[{
          backgroundColor: colors.background, borderRadius: 10, padding: 14, marginBottom: 4,
          flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.5 : 1,
        }, style]}>
        <Text style={{ flex: 1, color: value ? colors.text : colors.textSecondary, fontSize: 15 }} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <FontAwesome5 name="chevron-down" size={12} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: 14, maxHeight: '75%', overflow: 'hidden' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={t('common.search') as any}
                placeholderTextColor={colors.textSecondary}
                autoFocus
                style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 }}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item); setOpen(false); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, color: item.name === value ? colors.primary : colors.text, fontSize: 15, fontWeight: item.name === value ? '700' : '400' }}>
                    {item.name}
                  </Text>
                  {item.name === value && <FontAwesome5 name="check" size={13} color={colors.primary} solid />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>{t('common.no_data')}</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
