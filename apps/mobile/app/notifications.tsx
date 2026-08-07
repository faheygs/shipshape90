import { BackButton, Button, Icon, theme, useAppDialog, type IconName } from "@shipshape/ui-mobile";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AppNotification } from "../src/features/notifications/notificationRepository";
import { enablePushNotifications, notificationsAreEnabled } from "../src/features/notifications/pushNotifications";
import { useClearNotifications, useDeleteNotification, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../src/features/notifications/useNotifications";

const iconFor = (type: string): IconName => {
  if (type.includes("approved") || type.includes("joined") || type.includes("started")) return "flame";
  if (type.includes("declined") || type.includes("removed") || type.includes("failed") || type.includes("cancelled")) return "alert";
  if (type.includes("join_requested")) return "community";
  return "bell";
};

const timeLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  if (sameDay(date, today)) return `Today · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  if (sameDay(date, yesterday)) return `Yesterday · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function NotificationCard({ item, onPress, onClear, clearing }: { item: AppNotification; onPress: () => void; onClear: () => void; clearing: boolean }) {
  const unread = !item.readAt;
  const actionWidth = 78;
  const [translateX] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const settle = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    Animated.spring(translateX, { toValue: nextOpen ? -actionWidth : 0, useNativeDriver: true, damping: 22, stiffness: 240, mass: .7 }).start();
  }, [translateX]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
    onPanResponderMove: (_event, gesture) => {
      const origin = open ? -actionWidth : 0;
      translateX.setValue(Math.max(-actionWidth, Math.min(0, origin + gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => settle(open ? gesture.dx < 28 : gesture.dx < -30),
    onPanResponderTerminate: () => settle(open),
  }), [open, settle, translateX]);

  return <View style={styles.swipeShell}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${item.title}`} disabled={clearing} onPress={onClear} style={({ pressed }) => [styles.swipeAction, pressed && styles.swipeActionPressed, clearing && styles.swipeActionDisabled]}><Icon name="trash" size={21} color="#fff"/><Text style={styles.swipeActionLabel}>CLEAR</Text></Pressable>
    <Animated.View {...panResponder.panHandlers} style={[styles.card, unread && styles.cardUnread, { transform: [{ translateX }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} accessibilityActions={[{ name: "activate", label: "Open" }, { name: "clear", label: "Clear notification" }]} onAccessibilityAction={(event) => event.nativeEvent.actionName === "clear" ? onClear() : onPress()} onPress={() => open ? settle(false) : onPress()} style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}>
        <View style={[styles.iconBox, unread && styles.iconBoxUnread]}><Icon name={iconFor(item.type)} size={21} color={unread ? theme.colors.brandStrong : theme.colors.textSecondary}/></View>
        <View style={styles.cardCopy}><View style={styles.titleRow}><Text style={[styles.cardTitle, unread && styles.cardTitleUnread]}>{item.title}</Text>{unread ? <View style={styles.unreadDot}/> : null}</View><Text style={styles.cardBody}>{item.body}</Text><Text style={styles.cardTime}>{timeLabel(item.createdAt)}</Text></View>
        {item.actionPath ? <Icon name="arrow-right" size={17} color={theme.colors.textMuted}/> : null}
      </Pressable>
    </Animated.View>
  </View>;
}

export function NotificationsScreen({ showBackButton = true }: { showBackButton?: boolean }) {
  const { showDialog } = useAppDialog();
  const notifications = useNotifications();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const markAllRead = markAll.mutate;
  const deleteOne = useDeleteNotification();
  const clearAll = useClearNotifications();
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const items = notifications.data ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  useEffect(() => { void notificationsAreEnabled().then(setPushEnabled).catch(() => setPushEnabled(false)); }, []);
  useFocusEffect(useCallback(() => { markAllRead(); }, [markAllRead]));

  const openNotification = (item: AppNotification) => {
    if (!item.readAt) markOne.mutate(item.id);
    if (item.actionPath) router.push(item.actionPath as Href);
  };

  const enablePush = async () => {
    setEnablingPush(true);
    try {
      await enablePushNotifications();
      setPushEnabled(true);
      showDialog({ icon: "check", eyebrow: "NOTIFICATIONS ON", title: "You won’t miss the move.", message: "Challenge requests and important updates can now reach this phone." });
    } catch (error) {
      showDialog({ icon: "alert", title: "Notifications stayed off.", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setEnablingPush(false);
    }
  };

  const confirmClearAll = () => showDialog({
    icon: "alert",
    eyebrow: "CLEAR INBOX",
    title: "Clear every notification?",
    message: "This removes the notification cards from your inbox. Your challenge data and results stay untouched.",
    actions: [
      { label: "Keep notifications", variant: "secondary" },
      { label: "Clear all", variant: "danger", onPress: () => clearAll.mutate(undefined, { onError: (error) => showDialog({ icon: "alert", title: "Couldn’t clear notifications.", message: error instanceof Error ? error.message : "Please try again." }) }) },
    ],
  });

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}>{showBackButton ? <BackButton onPress={() => router.back()}/> : null}<View style={styles.headerCopy}><Text style={styles.eyebrow}>INBOX</Text><Text style={styles.headerTitle}>Notifications</Text></View>{items.length ? <Button size="sm" variant="secondary" loading={clearAll.isPending} onPress={confirmClearAll}>Clear all</Button> : <View style={styles.headerSpacer}/>}</View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {pushEnabled === false ? <View style={styles.pushCard}><View style={styles.pushIcon}><Icon name="bell" color={theme.colors.brandStrong}/></View><View style={styles.pushCopy}><Text style={styles.pushEyebrow}>STAY IN THE GAME</Text><Text style={styles.pushTitle}>Get important updates</Text><Text style={styles.pushBody}>Know when someone requests access, when you’re approved, or when a queued challenge starts.</Text></View><Button loading={enablingPush} onPress={() => void enablePush()}>Turn on notifications</Button></View> : null}
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{unread ? `${unread} new` : "You’re caught up"}</Text><Text style={styles.sectionMeta}>{items.length} TOTAL</Text></View>
      {notifications.isLoading ? <View style={styles.empty}><Text style={styles.emptyTitle}>Loading updates…</Text></View> : null}
      {!notifications.isLoading && !items.length ? <View style={styles.empty}><View style={styles.emptyIcon}><Icon name="bell" size={28} color={theme.colors.brandStrong}/></View><Text style={styles.emptyTitle}>Nothing here yet.</Text><Text style={styles.emptyBody}>Important challenge updates will land here as they happen.</Text></View> : null}
      <View style={styles.list}>{items.map((item) => <NotificationCard key={item.id} item={item} clearing={deleteOne.isPending && deleteOne.variables?.id === item.id} onPress={() => openNotification(item)} onClear={() => deleteOne.mutate(item, { onError: (error) => showDialog({ icon: "alert", title: "Couldn’t clear notification.", message: error instanceof Error ? error.message : "Please try again." }) })}/>)}</View>
    </ScrollView>
  </SafeAreaView>;
}

export default function NotificationsRoute() {
  return <NotificationsScreen />;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:theme.colors.canvas},header:{minHeight:70,flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:theme.colors.border,backgroundColor:theme.colors.surface},headerCopy:{flex:1},eyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1.2},headerTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:17},headerSpacer:{width:40},content:{padding:22,paddingBottom:54,gap:18},pushCard:{padding:18,borderRadius:23,borderWidth:1,borderColor:theme.colors.brand,backgroundColor:theme.colors.brandSoft,gap:14},pushIcon:{width:50,height:50,borderRadius:17,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.surface},pushCopy:{gap:3},pushEyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1.1},pushTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:18},pushBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18},sectionRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sectionTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:18},sectionMeta:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1},list:{gap:10},swipeShell:{minHeight:104,borderRadius:20,overflow:"hidden",backgroundColor:theme.colors.brandStrong},swipeAction:{position:"absolute",top:0,right:0,bottom:0,width:78,alignItems:"center",justifyContent:"center",gap:5,backgroundColor:theme.colors.brandStrong},swipeActionPressed:{opacity:.78},swipeActionDisabled:{opacity:.45},swipeActionLabel:{color:"#fff",fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:.9},card:{minHeight:104,flexDirection:"row",alignItems:"center",paddingHorizontal:15,borderRadius:20,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},cardUnread:{borderColor:theme.colors.brand,backgroundColor:theme.colors.brandSoft},cardMain:{flex:1,minHeight:102,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:15},iconBox:{width:44,height:44,borderRadius:15,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.canvas},iconBoxUnread:{backgroundColor:theme.colors.surface},cardCopy:{flex:1,gap:3},titleRow:{flexDirection:"row",alignItems:"center",gap:7},cardTitle:{flexShrink:1,color:theme.colors.textSecondary,fontFamily:theme.type.body,fontWeight:"800",fontSize:14},cardTitleUnread:{color:theme.colors.text},unreadDot:{width:7,height:7,borderRadius:4,backgroundColor:theme.colors.brand},cardBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:11,lineHeight:16},cardTime:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontWeight:"700",fontSize:8,marginTop:2},pressed:{opacity:.76,transform:[{scale:.99}]},empty:{minHeight:220,alignItems:"center",justifyContent:"center",padding:28,borderRadius:24,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface,gap:8},emptyIcon:{width:58,height:58,borderRadius:20,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.brandSoft,marginBottom:4},emptyTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:16},emptyBody:{maxWidth:260,textAlign:"center",color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18},
});
