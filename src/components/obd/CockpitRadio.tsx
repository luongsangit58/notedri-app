import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { RADIO_STATIONS } from '../../services/radio/radioStations';
import { useT } from '../../i18n';

// Rà soát 24/7 (góp ý user: đầu Android ô tô không có API chuẩn để bắt sóng
// FM thật qua phần cứng riêng của từng hãng - xem thảo luận, quyết định dùng
// radio internet thay thế) - nút nghe radio trên toolbar màn Đồng hồ, phát
// qua loa/Bluetooth xe hiện có, không cần phần cứng gì thêm.
let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}

export default function CockpitRadio({ accent }: { accent: string }) {
  const t = useT();
  const [stationIndex, setStationIndex] = useState<number | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const station = stationIndex != null ? RADIO_STATIONS[stationIndex] : null;
  const player = useAudioPlayer(station?.url ?? null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => { ensureAudioMode(); }, []);

  // Chọn đài trong danh sách phải PHÁT LUÔN (đúng kỳ vọng khi bấm vào 1 đài) -
  // không gọi play() thẳng trong selectStation() vì `player` lúc đó vẫn là
  // player CŨ (useAudioPlayer chỉ trỏ tới nguồn mới ở lần render kế tiếp) - đợi
  // qua effect để chắc chắn player đã gắn đúng station.url mới rồi mới play().
  useEffect(() => {
    if (station) player.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.url]);

  function selectStation(i: number) {
    setStationIndex(i);
    setPickerVisible(false);
  }

  function stopRadio() {
    player.pause();
    setStationIndex(null);
    setPickerVisible(false);
  }

  function togglePlay() {
    if (!station) { setPickerVisible(true); return; }
    if (status.playing) player.pause();
    else player.play();
  }

  const isPlaying = !!station && status.playing;

  return (
    <>
      <TouchableOpacity
        onPress={togglePlay}
        onLongPress={() => setPickerVisible(true)}
        style={[styles.styleBtn, { backgroundColor: accent + '33', borderColor: accent + '77' }]}
      >
        <FontAwesome5 name={isPlaying ? 'volume-up' : 'broadcast-tower'} size={18} color={accent} solid />
      </TouchableOpacity>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.title}>{t('obd.radio_picker_title')}</Text>
            {RADIO_STATIONS.map((s, i) => {
              const active = i === stationIndex;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => selectStation(i)}
                  style={[styles.row, active && { backgroundColor: accent + '22' }]}
                >
                  <FontAwesome5
                    name={active && status.playing ? 'volume-up' : 'circle'}
                    size={active ? 14 : 8}
                    color={active ? accent : '#8890A0'}
                    solid
                  />
                  <Text style={styles.rowText}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
            {station && (
              <TouchableOpacity onPress={stopRadio} style={styles.offRow}>
                <Text style={styles.offText}>{t('obd.radio_off')}</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  styleBtn: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#181A20', borderRadius: 16, padding: 10, gap: 2 },
  title: { color: '#8890A0', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 10 },
  rowText: { color: '#ECEEF2', fontSize: 15, fontWeight: '600' },
  offRow: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  offText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
});
