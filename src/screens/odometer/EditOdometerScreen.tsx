import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { odometerApi } from '../../api/odometer';
import { useUpdateOdometer, useDeleteOdometer } from '../../hooks/useOdometer';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{children}</Text>;
}

export default function EditOdometerScreen() {
  const t = useT();
  const colors = useColors();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '700',
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputLarge: {
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: 2,
      marginBottom: 16,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 4,
    },
    submitBtn: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 20,
    },
    deleteBtn: {
      backgroundColor: 'transparent',
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.error,
    },
    btnDisabled: {
      opacity: 0.7,
    },
    submitText: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 16,
    },
    deleteText: {
      color: colors.error,
      fontWeight: '700',
      fontSize: 15,
    },
  });

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { odometerReadingId } = route.params as { odometerReadingId: number };

  const updateOdometer = useUpdateOdometer();
  const deleteOdometer = useDeleteOdometer();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [odo, setOdo] = useState('');
  const [ngay, setNgay] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  useEffect(() => {
    odometerApi
      .get(odometerReadingId)
      .then((r) => {
        const data = r.data?.data ?? r.data;
        setOdo(data?.odometer != null ? String(data.odometer) : '');
        setNgay(data?.ngay ?? '');
        setGhiChu(data?.ghi_chu ?? '');
        setLoading(false);
      })
      .catch(() => navigation.goBack());
  }, [odometerReadingId]);

  const handleUpdate = async () => {
    if (!odo) {
      Alert.alert(t('common.error'), 'Vui lòng nhập số ODO');
      return;
    }
    if (!ngay) {
      Alert.alert(t('common.error'), 'Vui lòng nhập ngày');
      return;
    }
    setUpdating(true);
    try {
      await updateOdometer.mutateAsync({
        id: odometerReadingId,
        data: {
          odometer: parseInt(odo, 10),
          ngay,
          ghi_chu: ghiChu.trim() || null,
        },
      });
      navigation.goBack();
    } catch (err: any) {
      const errs = err?.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert(t('common.error'), detail ?? err?.response?.data?.message ?? 'Không cập nhật được');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('odometer.delete_confirm_title'),
      t('odometer.delete_confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteOdometer.mutate(odometerReadingId, {
              onSuccess: () => navigation.goBack(),
              onError: (e: any) =>
                Alert.alert(t('common.error'), e?.response?.data?.message ?? 'Không xoá được'),
            });
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isBusy = updating || deleteOdometer.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Header row */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('odometer.edit_title')}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ODO field */}
          <FieldLabel>{t('odometer.value_label')}</FieldLabel>
          <TextInput
            value={odo}
            onChangeText={setOdo}
            placeholder="98443"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={[styles.input, styles.inputLarge]}
          />

          {/* Ngay field */}
          <FieldLabel>{t('odometer.date_required')}</FieldLabel>
          <TextInput
            value={ngay}
            onChangeText={setNgay}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Ghi chu field */}
          <FieldLabel>{t('common.note')}</FieldLabel>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder="Ghi chú thêm..."
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {/* Update button */}
          <TouchableOpacity
            onPress={handleUpdate}
            disabled={isBusy}
            style={[styles.submitBtn, isBusy && styles.btnDisabled]}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>{t('common.update')}</Text>}
          </TouchableOpacity>

          {/* Delete button */}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={isBusy}
            style={[styles.deleteBtn, isBusy && styles.btnDisabled]}
          >
            {deleteOdometer.isPending
              ? <ActivityIndicator color={colors.error} />
              : <Text style={styles.deleteText}>{t('odometer.delete_confirm_title')}</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
