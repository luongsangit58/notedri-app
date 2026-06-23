import React, { useCallback } from 'react';
import { FlatList, RefreshControl, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTimeline } from '../../hooks/useTimeline';
import TimelineItem from '../../components/TimelineItem';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

export default function TimelineScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, isError, refetch, isFetchingNextPage, fetchNextPage, hasNextPage, isFetching } = useTimeline();

  const allItems = data?.pages.flatMap((p: any) => p.data ?? p) ?? [];

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được nhật ký" onRetry={refetch} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        data={allItems}
        keyExtractor={(item: any) => `${item.type}-${item.id}`}
        renderItem={({ item }) => (
          <TimelineItem
            item={item}
            onPress={item.type === 'refuel' && item.id
              ? () => navigation.navigate('EditRefuel', { refuelId: item.id })
              : item.type === 'service' && item.id
              ? () => navigation.navigate('EditService', { serviceId: item.id })
              : item.type === 'odometer' && item.id
              ? () => navigation.navigate('EditOdometer', { odometerReadingId: item.id })
              : undefined}
          />
        )}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching && !isFetchingNextPage} onRefresh={refetch} tintColor={colors.primary} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 48 }}><Text style={{ color: colors.textSecondary }}>Chưa có sự kiện nào</Text></View>}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
      />
    </SafeAreaView>
  );
}
