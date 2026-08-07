import { BackButton, Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAvatarUrl } from "../../src/features/auth/authRepository";
import type { ManagedChallengeMember, ManagedQueueEntry } from "../../src/features/management/challengeManagementRepository";
import {
  useChallengeManagement,
  useCloseManagedChallenge,
  useManagedChallengeInvites,
  useManagedChallengeMembers,
  useManagedChallengeQueue,
  useRemoveManagedMember,
  useReviewJoinRequest,
} from "../../src/features/management/useChallengeManagement";

type ManageSection = "overview" | "requests" | "people" | "invites";
const initialsFor = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function PersonAvatar({ name, path }: { name: string; path: string | null }) {
  const url = getAvatarUrl(path);
  return url ? <Image source={{ uri: url }} style={styles.avatarImage}/> : <View style={styles.avatar}><Text style={styles.avatarText}>{initialsFor(name)}</Text></View>;
}

function PersonRow({ member, onRemove }: { member: ManagedChallengeMember; onRemove?: () => void }) {
  return <View style={styles.personCard}><PersonAvatar name={member.displayName} path={member.avatarPath}/><View style={styles.personCopy}><View style={styles.personNameRow}><Text numberOfLines={1} style={styles.personName}>{member.displayName}</Text><Text style={styles.role}>{member.role.toUpperCase()}</Text></View><Text style={styles.handle}>@{member.handle} · {member.status.toUpperCase()}</Text><Text style={styles.personStats}>{member.totalPoints} points · {Math.round(member.completionPercentage)}% tasks · {member.perfectDays} perfect days</Text></View>{onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.displayName}`} onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><Icon name="close" size={17} color={theme.colors.danger}/></Pressable> : null}</View>;
}

function QueueRow({ entry }: { entry: ManagedQueueEntry }) {
  return <View style={styles.personCard}><PersonAvatar name={entry.displayName} path={entry.avatarPath}/><View style={styles.personCopy}><View style={styles.personNameRow}><Text style={styles.personName}>{entry.displayName}</Text><Text style={[styles.role, entry.status === "blocked" && styles.roleBlocked]}>{entry.status.toUpperCase()}</Text></View><Text style={styles.handle}>@{entry.handle}</Text><Text style={styles.personStats}>{entry.scoringTimeZone} · {entry.allowAutoSwitch ? "Switch approved" : "No active conflict"}</Text></View></View>;
}

export default function ManageChallengeScreen() {
  const { id = "", section: requestedSection } = useLocalSearchParams<{ id: string; section?: string }>();
  const { showDialog } = useAppDialog();
  const [section, setSection] = useState<ManageSection>(requestedSection === "requests" ? "requests" : "overview");
  const summary = useChallengeManagement(id);
  const members = useManagedChallengeMembers(id);
  const queue = useManagedChallengeQueue(id);
  const invites = useManagedChallengeInvites(id);
  const review = useReviewJoinRequest(id);
  const remove = useRemoveManagedMember(id);
  const closeChallenge = useCloseManagedChallenge(id);
  const challenge = summary.data;
  const isPrivate = challenge?.visibility === "private";
  const upcoming = challenge?.status === "registration";
  const sections: { id: ManageSection; label: string }[] = isPrivate
    ? [{ id: "overview", label: "Overview" }, { id: "requests", label: "Requests" }, { id: "people", label: "People" }, { id: "invites", label: "Code" }]
    : [{ id: "overview", label: "Overview" }, { id: "people", label: "People" }];
  const requests = (members.data ?? []).filter((member) => member.status === "pending");
  const participants = (members.data ?? []).filter((member) => member.status !== "pending" && member.status !== "removed" && member.status !== "left");
  const activeInvites = (invites.data ?? []).filter((invite) => !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt) > new Date()));
  const privateCode = activeInvites[0] ?? null;
  const activeSection: ManageSection = !isPrivate && (section === "requests" || section === "invites") ? "overview" : section;

  const handleError = (title: string, error: Error) => showDialog({ icon: "alert", title, message: error.message || "Please try again." });
  const decideRequest = (member: ManagedChallengeMember, approve: boolean) => {
    if (approve) {
      review.mutate({ memberId: member.memberId, approve: true }, { onError: (error) => handleError("Couldn’t approve request.", error) });
      return;
    }
    showDialog({ icon: "alert", eyebrow: "DECLINE REQUEST", title: `Decline ${member.displayName}?`, message: "They will not join this challenge, and this request will be closed.", actions: [{ label: "Keep request", variant: "secondary" }, { label: "Decline", variant: "danger", onPress: () => review.mutate({ memberId: member.memberId, approve: false }, { onError: (error) => handleError("Couldn’t decline request.", error) }) }] });
  };
  const confirmRemove = (member: ManagedChallengeMember) => showDialog({ icon: "alert", eyebrow: "REMOVE PARTICIPANT", title: `Remove ${member.displayName}?`, message: "Their progress remains in the record, but they lose prize eligibility and cannot continue this challenge.", actions: [{ label: "Keep participant", variant: "secondary" }, { label: "Remove", variant: "danger", onPress: () => remove.mutate(member.memberId, { onError: (error) => handleError("Couldn’t remove participant.", error) }) }] });
  const sharePrivateCode = () => {
    if (!privateCode) return;
    void Share.share({ message: `Join ${challenge?.name ?? "my ShipShape challenge"} on ShipShape 90 with private code ${privateCode.code}. https://shipshape90.com` });
  };
  const confirmClose = (action: "cancel" | "end") => showDialog({ icon: "alert", eyebrow: "PERMANENT HOST ACTION", title: action === "cancel" ? "Cancel this challenge?" : "End this challenge now?", message: action === "cancel" ? "The challenge will close before launch. Requests and queued enrollments will be cancelled, and this cannot be undone." : "Final points will freeze now. Active participants become finishers and pending requests close. This cannot be undone.", actions: [{ label: "Keep challenge", variant: "secondary" }, { label: action === "cancel" ? "Cancel challenge" : "End challenge", variant: "danger", onPress: () => closeChallenge.mutate(action, { onSuccess: () => router.replace("/(tabs)/home"), onError: (error) => handleError("Couldn’t close challenge.", error) }) }] });

  if (!challenge) return <SafeAreaView style={styles.safe}><View style={styles.loading}><BackButton onPress={() => router.back()}/><Text style={styles.muted}>{summary.isLoading ? "Opening host controls…" : "Challenge management could not be opened."}</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <View style={styles.topBar}><BackButton onPress={() => router.back()}/><View style={styles.topCopy}><Text style={styles.topEyebrow}>HOST CONTROLS</Text><Text numberOfLines={1} style={styles.topTitle}>{challenge.name}</Text></View><View style={styles.statusPill}><Text style={styles.statusText}>{upcoming ? "UPCOMING" : challenge.status.toUpperCase()}</Text></View></View>
    <View style={styles.tabs}>{sections.map((item) => {
      const selected = activeSection === item.id;
      return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setSection(item.id)} style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}><Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.id === "requests" && requests.length ? `${item.label} ${requests.length}` : item.label}</Text></Pressable>;
    })}</View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {activeSection === "overview" ? <>
        <View style={styles.hero}><Text style={styles.heroEyebrow}>CHALLENGE COMMAND</Text><Text style={styles.heroTitle}>{challenge.name}</Text><Text style={styles.heroDates}>{dateLabel(challenge.startsOn)} – {dateLabel(challenge.endsOn)}</Text><View style={styles.heroStatus}><Icon name={upcoming ? "calendar" : "flame"} color={theme.colors.brandStrong}/><Text style={styles.heroStatusText}>{upcoming ? "Registration is open" : "Challenge is live"}</Text></View></View>
        <View style={styles.metricGrid}><View style={styles.metric}><Text style={styles.metricValue}>{challenge.activeMembers}</Text><Text style={styles.metricLabel}>PARTICIPANTS</Text></View>{isPrivate ? <View style={styles.metric}><Text style={styles.metricValue}>{challenge.pendingRequests}</Text><Text style={styles.metricLabel}>REQUESTS</Text></View> : null}{upcoming && !isPrivate ? <View style={styles.metric}><Text style={styles.metricValue}>{challenge.queuedMembers}</Text><Text style={styles.metricLabel}>QUEUED</Text></View> : null}<View style={styles.metric}><Text style={styles.metricValue}>{Math.round(challenge.averageCompletion)}%</Text><Text style={styles.metricLabel}>AVG TASKS</Text></View></View>
        <View style={styles.performanceCard}><View style={styles.performanceIcon}><Icon name="trophy" color={theme.colors.brandStrong}/></View><View style={styles.performanceCopy}><Text style={styles.cardEyebrow}>GROUP PERFORMANCE</Text><Text style={styles.performanceValue}>{challenge.totalPoints.toLocaleString()} points earned</Text><Text style={styles.cardBody}>Across every active and completed participant.</Text></View></View>
        <View style={styles.lockCard}><Icon name="lock" size={21} color={theme.colors.brandStrong}/><View style={styles.lockCopy}><Text style={styles.cardTitle}>{challenge.rulesLocked ? "Rules are locked" : "Rules are editable"}</Text><Text style={styles.cardBody}>{challenge.rulesLocked ? "Tasks and scoring cannot change after publication, keeping competition fair." : "Finish configuring the challenge before publication."}</Text></View></View>
        <View style={styles.dangerCard}><Text style={styles.dangerEyebrow}>CHALLENGE LIFECYCLE</Text><Text style={styles.dangerTitle}>{upcoming ? "Cancel before launch" : "End competition early"}</Text><Text style={styles.dangerBody}>{upcoming ? "Cancelling closes requests and queued enrollments." : "Ending freezes points and moves the challenge into everyone’s history."}</Text><Button variant="danger" loading={closeChallenge.isPending} onPress={() => confirmClose(upcoming ? "cancel" : "end")}>{upcoming ? "Cancel challenge" : "End challenge now"}</Button></View>
      </> : null}

      {activeSection === "requests" && isPrivate ? <>
        <View style={styles.sectionHeader}><Text style={styles.eyebrow}>PRIVATE REQUESTS</Text><Text style={styles.sectionTitle}>Choose the roster.</Text><Text style={styles.sectionBody}>People who enter your private code wait here until you approve them.</Text></View>
        {requests.length ? <View style={styles.stack}>{requests.map((member) => <View key={member.memberId} style={styles.requestCard}><View style={styles.requestPerson}><PersonAvatar name={member.displayName} path={member.avatarPath}/><View style={styles.personCopy}><Text style={styles.personName}>{member.displayName}</Text><Text style={styles.handle}>@{member.handle}</Text></View></View><View style={styles.requestActions}><Button size="sm" variant="secondary" disabled={review.isPending} onPress={() => decideRequest(member, false)}>Decline</Button><Button size="sm" loading={review.isPending} onPress={() => decideRequest(member, true)}>Approve</Button></View></View>)}</View> : <View style={styles.empty}><Icon name="check" color={theme.colors.success}/><View style={styles.emptyCopy}><Text style={styles.cardTitle}>You’re caught up</Text><Text style={styles.cardBody}>New approval requests will appear here.</Text></View></View>}
      </> : null}

      {activeSection === "people" ? <>
        <View style={styles.sectionHeader}><Text style={styles.eyebrow}>PARTICIPANTS</Text><Text style={styles.sectionTitle}>Your roster.</Text><Text style={styles.sectionBody}>{upcoming && !isPrivate ? "See performance, prize eligibility, and everyone waiting for launch." : "See performance and prize eligibility for everyone in this challenge."}</Text></View>
        <View style={styles.sectionLabelRow}><Text style={styles.sectionLabel}>ACTIVE & FINISHED</Text><Text style={styles.sectionCount}>{participants.length}</Text></View>
        <View style={styles.stack}>{participants.map((member) => <PersonRow key={member.memberId} member={member} onRemove={member.role === "participant" && member.status === "active" ? () => confirmRemove(member) : undefined}/>)}</View>
        {upcoming && !isPrivate ? <><View style={styles.sectionLabelRow}><Text style={styles.sectionLabel}>START QUEUE</Text><Text style={styles.sectionCount}>{queue.data?.length ?? 0}</Text></View>{(queue.data?.length ?? 0) ? <View style={styles.stack}>{queue.data?.map((entry) => <QueueRow key={entry.profileId} entry={entry}/>)}</View> : <View style={styles.empty}><Icon name="calendar" color={theme.colors.brandStrong}/><Text style={styles.cardBody}>No one is queued for the start yet.</Text></View>}</> : null}
      </> : null}

      {activeSection === "invites" && isPrivate ? <>
        <View style={styles.sectionHeader}><Text style={styles.eyebrow}>PRIVATE CHALLENGE</Text><Text style={styles.sectionTitle}>Your door code.</Text><Text style={styles.sectionBody}>This code was created with the challenge. Share it with the people you want to request access.</Text></View>
        {privateCode ? <View style={styles.inviteCard}><View style={styles.inviteTop}><Text selectable style={styles.inviteCode}>{privateCode.code}</Text><View style={styles.activeTag}><Text style={styles.activeTagText}>PRIVATE</Text></View></View><Text style={styles.inviteMeta}>{privateCode.useCount} request{privateCode.useCount === 1 ? "" : "s"} made with this code</Text><Button onPress={sharePrivateCode}>Share private code</Button></View> : <View style={styles.empty}><Icon name="lock" color={theme.colors.brandStrong}/><Text style={styles.cardBody}>{invites.isLoading ? "Loading your private code…" : "Your private code could not be loaded."}</Text></View>}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:theme.colors.canvas},loading:{flex:1,padding:24,gap:22},muted:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontSize:13},topBar:{minHeight:68,flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:theme.colors.border,backgroundColor:theme.colors.surface},topCopy:{flex:1},topEyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1.2},topTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:15},statusPill:{paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:theme.colors.brandSoft},statusText:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:.8},tabs:{height:58,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:theme.colors.border,backgroundColor:theme.colors.surface},tab:{flex:1,height:38,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.canvas},tabSelected:{backgroundColor:theme.colors.brandStrong},tabText:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontWeight:"800",fontSize:11},tabTextSelected:{color:"#fff"},content:{padding:22,paddingBottom:56,gap:18},hero:{minHeight:220,padding:21,borderRadius:26,justifyContent:"flex-end",gap:5,backgroundColor:theme.colors.brandStrong},heroEyebrow:{color:theme.colors.accent,fontFamily:theme.type.body,fontWeight:"900",fontSize:9,letterSpacing:1.3},heroTitle:{color:"#fff",fontFamily:theme.type.display,fontSize:46,lineHeight:48,letterSpacing:1.2},heroDates:{color:"#FFFFFFC7",fontFamily:theme.type.body,fontSize:12},heroStatus:{alignSelf:"flex-start",marginTop:9,flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:10,paddingVertical:7,borderRadius:12,backgroundColor:theme.colors.accent},heroStatusText:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:9},metricGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},metric:{width:"48%",minHeight:91,padding:15,borderRadius:18,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface,justifyContent:"space-between"},metricValue:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:34},metricLabel:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:.8},performanceCard:{flexDirection:"row",alignItems:"center",gap:13,padding:17,borderRadius:20,backgroundColor:theme.colors.accentSoft},performanceIcon:{width:48,height:48,borderRadius:16,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.surface},performanceCopy:{flex:1,gap:2},cardEyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1},performanceValue:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:17},cardTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:15},cardBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18},lockCard:{flexDirection:"row",alignItems:"flex-start",gap:12,padding:17,borderRadius:19,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},lockCopy:{flex:1,gap:3},dangerCard:{padding:18,borderRadius:21,backgroundColor:theme.colors.dangerSoft,gap:7},dangerEyebrow:{color:theme.colors.danger,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1},dangerTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:18},dangerBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18,marginBottom:8},sectionHeader:{gap:5,marginBottom:4},eyebrow:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:9,letterSpacing:1.3},sectionTitle:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:42,lineHeight:45,letterSpacing:1},sectionBody:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:13,lineHeight:20},stack:{gap:10},requestCard:{padding:16,borderRadius:20,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface,gap:14},requestPerson:{flexDirection:"row",alignItems:"center",gap:12},requestActions:{flexDirection:"row",gap:10},avatar:{width:46,height:46,borderRadius:23,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.brand},avatarImage:{width:46,height:46,borderRadius:23,backgroundColor:theme.colors.brandSoft},avatarText:{color:"#fff",fontFamily:theme.type.body,fontWeight:"900",fontSize:13},personCard:{flexDirection:"row",alignItems:"center",gap:12,padding:14,borderRadius:18,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},personCopy:{flex:1,gap:2},personNameRow:{flexDirection:"row",alignItems:"center",gap:7},personName:{flexShrink:1,color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"800",fontSize:14},handle:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontSize:10},personStats:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:10,marginTop:2},role:{paddingHorizontal:6,paddingVertical:3,borderRadius:999,color:theme.colors.brandStrong,backgroundColor:theme.colors.brandSoft,fontFamily:theme.type.body,fontWeight:"900",fontSize:6,letterSpacing:.6},roleBlocked:{color:theme.colors.danger,backgroundColor:theme.colors.dangerSoft},removeButton:{width:36,height:36,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.dangerSoft},pressed:{opacity:.7},sectionLabelRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:5},sectionLabel:{color:theme.colors.textSecondary,fontFamily:theme.type.body,fontWeight:"900",fontSize:9,letterSpacing:1.1},sectionCount:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:11},empty:{minHeight:78,flexDirection:"row",alignItems:"center",gap:12,padding:17,borderRadius:19,borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},emptyCopy:{flex:1,gap:2},inviteCard:{padding:17,borderRadius:20,borderWidth:1,borderColor:theme.colors.brand,backgroundColor:theme.colors.surface,gap:12},inviteTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},inviteCode:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:31,letterSpacing:2},activeTag:{paddingHorizontal:8,paddingVertical:5,borderRadius:999,backgroundColor:theme.colors.brandSoft},activeTagText:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:7,letterSpacing:.8},inviteMeta:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontSize:11},
});
