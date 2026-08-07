import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearNotifications, deleteNotification, getUnreadNotificationCount, listMyNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "./notificationRepository";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: ["notifications", "list"] as const,
  unread: ["notifications", "unread"] as const,
};

export const useNotifications = () => useQuery({
  queryKey: notificationKeys.list,
  queryFn: listMyNotifications,
  staleTime: 15_000,
});

export const useUnreadNotificationCount = (enabled = true) => useQuery({
  queryKey: notificationKeys.unread,
  queryFn: getUnreadNotificationCount,
  enabled,
  staleTime: 10_000,
});

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationKeys.list }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.unread }),
      ]);
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationKeys.list }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.unread }),
      ]);
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notification: AppNotification) => deleteNotification(notification.id),
    onMutate: async (notification) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationKeys.list }),
        queryClient.cancelQueries({ queryKey: notificationKeys.unread }),
      ]);
      const previousList = queryClient.getQueryData<AppNotification[]>(notificationKeys.list);
      const previousUnread = queryClient.getQueryData<number>(notificationKeys.unread);
      queryClient.setQueryData<AppNotification[]>(notificationKeys.list, (items) => items?.filter((item) => item.id !== notification.id) ?? []);
      if (!notification.readAt) queryClient.setQueryData<number>(notificationKeys.unread, (count) => Math.max(0, (count ?? 0) - 1));
      return { previousList, previousUnread };
    },
    onError: (_error, _notification, context) => {
      if (context?.previousList) queryClient.setQueryData(notificationKeys.list, context.previousList);
      if (context?.previousUnread !== undefined) queryClient.setQueryData(notificationKeys.unread, context.previousUnread);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationKeys.list }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.unread }),
      ]);
    },
  });
}

export function useClearNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearNotifications,
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationKeys.list }),
        queryClient.cancelQueries({ queryKey: notificationKeys.unread }),
      ]);
      const previousList = queryClient.getQueryData<AppNotification[]>(notificationKeys.list);
      const previousUnread = queryClient.getQueryData<number>(notificationKeys.unread);
      queryClient.setQueryData(notificationKeys.list, []);
      queryClient.setQueryData(notificationKeys.unread, 0);
      return { previousList, previousUnread };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) queryClient.setQueryData(notificationKeys.list, context.previousList);
      if (context?.previousUnread !== undefined) queryClient.setQueryData(notificationKeys.unread, context.previousUnread);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationKeys.list }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.unread }),
      ]);
    },
  });
}
