import { Button, ChoiceChip, Icon, theme } from "@shipshape/ui-mobile";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { metricSeries, useBodyProgress } from "../features/progress/useBodyProgress";
import { useChallengeCheckins } from "../features/checkins/useChallengeCheckins";
import { useChallengeLeaderboard } from "../features/leaderboard/useChallengeLeaderboard";
import { TrendChart } from "./TrendChart";
import { BodyLogModal } from "./BodyLogModal";

type Metric = "weight" | "bodyFatPercentage";

export function BodyProgressPanel({ challengeId, compact = false }: { challengeId?: string; compact?: boolean }) {
  const insets = useSafeAreaInsets();
  const progress = useBodyProgress(challengeId);
  const checkins = useChallengeCheckins(challengeId ?? "");
  const leaderboard = useChallengeLeaderboard(challengeId ?? "");
  const [metric, setMetric] = useState<Metric>("weight");
  const [modalOpen, setModalOpen] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [selectingComparison, setSelectingComparison] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const logs = useMemo(() => progress.data ?? [], [progress.data]);
  const series = useMemo(() => metricSeries(logs, metric), [logs, metric]);
  const first = series[0]?.value;
  const latest = series[series.length - 1]?.value;
  const change = first === undefined || latest === undefined ? null : latest - first;
  const photos = useMemo(() => logs.filter((log) => log.photoUrl).reverse(), [logs]);
  const selectedPhotos = selectedPhotoIds.flatMap((id) => {
    const selected = photos.find((candidate) => candidate.id === id);
    return selected ? [selected] : [];
  });
  const comparisonPhotos = selectedPhotos;
  const sameComparisonDay = comparisonPhotos.length === 2 && comparisonPhotos[0].loggedOn === comparisonPhotos[1].loggedOn;
  const currentStanding = leaderboard.data?.find((entry) => entry.isCurrentUser);

  const formatPhotoDate = (date: string, long = false) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, long
    ? { month: "long", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric" });
  const formatPhotoTime = (date: string) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const openPhoto = (index: number) => {
    setViewerIndex(index);
    setPhotoViewerOpen(true);
  };

  const toggleComparisonPhoto = (id: string) => {
    setSelectedPhotoIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : current.length < 2 ? [...current, id] : [current[0], id]);
  };

  const stopComparing = () => {
    setSelectingComparison(false);
    setSelectedPhotoIds([]);
  };

  return <>
    <StatusBar style={photoViewerOpen ? "light" : "dark"} animated />
    <View style={styles.panel}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>{challengeId ? "CHALLENGE PROGRESS" : "ALL-TIME PROGRESS"}</Text><Text style={styles.title}>{compact ? "Body trends" : "See the work."}</Text></View><Button size="sm" leadingIcon="create" onPress={() => setModalOpen(true)}>Add log</Button></View>
      {challengeId && (checkins.data?.length ?? 0) > 0 ? <View style={styles.checkinBoard}>
        <View style={styles.checkinBoardHead}><View><Text style={styles.checkinBoardEyebrow}>REQUIRED MARKERS</Text><Text style={styles.checkinBoardTitle}>Check-in run</Text></View><Text style={styles.checkinBoardCount}>{checkins.data?.filter((checkpoint) => checkpoint.completedAt).length}/{checkins.data?.length}</Text></View>
        <View style={styles.checkinList}>{checkins.data?.map((checkpoint, index) => <View key={checkpoint.id} style={styles.checkinRow}><View style={[styles.checkinState, checkpoint.completedAt && styles.checkinStateComplete, checkpoint.isBlocking && styles.checkinStateDue]}>{checkpoint.completedAt ? <Icon name="check" size={16} color="#FFFFFF"/> : <Text style={styles.checkinStateText}>{index + 1}</Text>}</View><View style={styles.checkinCopy}><Text style={styles.checkinTitle}>{checkpoint.label}</Text><Text style={styles.checkinMeta}>Day {checkpoint.dayNumber} · {[checkpoint.requiresWeight ? "weight" : "", checkpoint.requiresBodyFat ? "body fat" : "", checkpoint.requiresPhoto ? "photo" : ""].filter(Boolean).join(" + ")}</Text></View><Text style={[styles.checkinStatus, checkpoint.isBlocking && styles.checkinStatusDue]}>{checkpoint.completedAt ? "DONE" : checkpoint.isBlocking ? "DUE" : "UPCOMING"}</Text></View>)}</View>
      </View> : null}
      {challengeId && currentStanding && (currentStanding.weightBonusCalculation || currentStanding.bodyFatBonusCalculation) ? <View style={styles.scoreBreakdown}>
        <Text style={styles.checkinBoardEyebrow}>YOUR SCORE</Text>
        <View style={styles.scoreRow}><View style={styles.scoreTile}><Text style={styles.scoreValue}>{currentStanding.totalPoints}</Text><Text style={styles.scoreLabel}>SHIPSHAPE POINTS</Text></View>{currentStanding.weightBonusCalculation ? <View style={styles.scoreTile}><Text style={styles.scoreValue}>+{currentStanding.weightBonusPoints}</Text><Text style={styles.scoreLabel}>WEIGHT BONUS</Text></View> : null}{currentStanding.bodyFatBonusCalculation ? <View style={styles.scoreTile}><Text style={styles.scoreValue}>+{currentStanding.bodyFatBonusPoints}</Text><Text style={styles.scoreLabel}>BODY-FAT BONUS</Text></View> : null}</View>
        <View style={styles.scoreTotal}><Text style={styles.scoreTotalLabel}>TOTAL · RANK #{currentStanding.rank}</Text><Text style={styles.scoreTotalValue}>{currentStanding.totalScore}</Text></View>
      </View> : null}
      <View style={styles.metricChoices}><ChoiceChip label="Weight" selected={metric === "weight"} onPress={() => setMetric("weight")} /><ChoiceChip label="Body fat" selected={metric === "bodyFatPercentage"} onPress={() => setMetric("bodyFatPercentage")} /></View>
      <View style={styles.summaryRow}><View style={styles.summaryCard}><Text style={styles.summaryLabel}>START</Text><Text style={styles.summaryValue}>{first ?? "—"}</Text></View><View style={styles.summaryCard}><Text style={styles.summaryLabel}>LATEST</Text><Text style={styles.summaryValue}>{latest ?? "—"}</Text></View><View style={[styles.summaryCard, styles.changeCard]}><Text style={styles.summaryLabel}>CHANGE</Text><Text style={styles.summaryValue}>{change === null ? "—" : `${change > 0 ? "+" : ""}${Number(change.toFixed(1))}`}</Text></View></View>
      <TrendChart data={series} suffix={metric === "bodyFatPercentage" ? "%" : ""} />
      {photos.length ? <>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleGroup}><Text style={styles.sectionTitle}>Progress photos</Text><Text style={styles.privateLabel}>PRIVATE</Text></View>
          {!selectingComparison && photos.length > 1 ? <Button size="sm" variant="secondary" onPress={() => setSelectingComparison(true)}>Compare</Button> : null}
        </View>
        {selectingComparison ? <View style={styles.compareControls}>
          <View style={styles.compareCopy}><Text style={styles.compareTitle}>Choose two photos</Text><Text style={styles.compareHint}>{selectedPhotoIds.length}/2 selected</Text></View>
          <Button size="sm" variant="secondary" onPress={stopComparing}>Cancel</Button>
        </View> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((log, index) => {
            const selectionIndex = selectedPhotoIds.indexOf(log.id);
            const selected = selectionIndex >= 0;
            return <Pressable
              key={log.id}
              accessibilityRole="button"
              accessibilityLabel={`${selectingComparison ? selected ? "Deselect" : "Select" : "Open"} progress photo from ${formatPhotoDate(log.loggedOn, true)}`}
              onPress={() => selectingComparison ? toggleComparisonPhoto(log.id) : openPhoto(index)}
              style={({ pressed }) => [styles.photoWrap, selected && styles.photoWrapSelected, pressed && styles.pressed]}
            >
              <Image source={{ uri: log.photoUrl ?? undefined }} style={styles.photo}/>
              {selected ? <View style={styles.selectionBadge}><Text style={styles.selectionNumber}>{selectionIndex + 1}</Text></View> : null}
              <View style={styles.photoCaption}><Text style={styles.photoDate}>{formatPhotoDate(log.loggedOn)}</Text><Icon name="arrow-right" size={14} color={selected ? theme.colors.brandStrong : theme.colors.textMuted}/></View>
            </Pressable>;
          })}
        </ScrollView>
        {selectingComparison ? <Button disabled={selectedPhotos.length !== 2} onPress={() => setComparisonOpen(true)}>Compare photos</Button> : null}
      </> : null}
      {!compact && logs.length ? <><Text style={styles.sectionTitle}>Recent logs</Text><View style={styles.logs}>{[...logs].reverse().slice(0, 5).map((log) => <View key={log.id} style={styles.logRow}><View><Text style={styles.logDate}>{new Date(`${log.loggedOn}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</Text><Text style={styles.logMeta}>{[log.weight ? `${log.weight} weight` : "", log.bodyFatPercentage ? `${log.bodyFatPercentage}% body fat` : "", log.photoPath ? "Photo" : ""].filter(Boolean).join(" · ")}</Text></View><View style={styles.logDot}/></View>)}</View></> : null}
    </View>

    <BodyLogModal challengeId={challengeId} visible={modalOpen} onClose={() => setModalOpen(false)} />

    <Modal visible={photoViewerOpen} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setPhotoViewerOpen(false)}>
      <View style={[styles.viewerSafe, { paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 54 : 24), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.viewerHeader}>
          <View style={styles.viewerHeaderCopy}><Text style={styles.viewerEyebrow}>PROGRESS PHOTO</Text><Text style={styles.viewerTitle}>{photos[viewerIndex] ? formatPhotoDate(photos[viewerIndex].loggedOn, true) : ""}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setPhotoViewerOpen(false)} style={styles.viewerClose}><Icon name="close" size={20} color="#FFFFFF"/></Pressable>
        </View>
        <ScrollView style={styles.viewerCanvas} contentContainerStyle={styles.viewerCanvasContent} maximumZoomScale={4} minimumZoomScale={1} centerContent>
          {photos[viewerIndex]?.photoUrl ? <Image source={{ uri: photos[viewerIndex].photoUrl ?? undefined }} resizeMode="contain" style={styles.viewerImage}/> : null}
        </ScrollView>
        <View style={styles.viewerFooter}>
          <View style={styles.viewerDock}>
            <Pressable accessibilityRole="button" accessibilityLabel="View newer photo" accessibilityState={{ disabled: viewerIndex === 0 }} disabled={viewerIndex === 0} onPress={() => setViewerIndex((current) => Math.max(0, current - 1))} style={({ pressed }) => [styles.viewerNavButton, viewerIndex === 0 && styles.viewerNavButtonDisabled, pressed && styles.pressed]}><Icon name="chevron-left" size={21} color="#FFFFFF"/></Pressable>
            <Text style={styles.viewerCount}>{photos.length ? `${viewerIndex + 1} / ${photos.length}` : ""}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View older photo" accessibilityState={{ disabled: viewerIndex === photos.length - 1 }} disabled={viewerIndex === photos.length - 1} onPress={() => setViewerIndex((current) => Math.min(photos.length - 1, current + 1))} style={({ pressed }) => [styles.viewerNavButton, viewerIndex === photos.length - 1 && styles.viewerNavButtonDisabled, pressed && styles.pressed]}><Icon name="arrow-right" size={21} color="#FFFFFF"/></Pressable>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={comparisonOpen} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setComparisonOpen(false)}>
      <View style={[styles.compareSafe, { paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 54 : 24), paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.compareHeader}>
          <View style={styles.compareHeaderCopy}><Text style={styles.eyebrow}>PHOTO COMPARE</Text><Text style={styles.compareScreenTitle}>See the change.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close comparison" onPress={() => setComparisonOpen(false)} style={styles.closeButton}><Icon name="close" size={20}/></Pressable>
        </View>
        <View style={styles.comparisonCanvas}>
          <View style={styles.collageCard}>
          {comparisonPhotos.map((log, index) => <Pressable
            key={log.id}
            accessibilityRole="button"
            accessibilityLabel={`Open photo ${index + 1} full screen`}
            onPress={() => {
              const photoIndex = photos.findIndex((photoLog) => photoLog.id === log.id);
              setComparisonOpen(false);
              if (photoIndex >= 0) openPhoto(photoIndex);
            }}
            style={({ pressed }) => [styles.collagePane, pressed && styles.pressed]}
          >
            <Image source={{ uri: log.photoUrl ?? undefined }} resizeMode="cover" style={styles.collageImage}/>
            <View style={styles.collageMoment}><Text style={styles.collageMomentText}>{index === 0 ? "PHOTO 1" : "PHOTO 2"}</Text></View>
            <View style={styles.collageDate}><Text style={styles.collageDateText}>{formatPhotoDate(log.loggedOn)}{sameComparisonDay ? ` · ${formatPhotoTime(log.createdAt)}` : ""}</Text></View>
          </Pressable>)}
          <View pointerEvents="none" style={styles.collageSeam}/>
          </View>
          <Text style={styles.comparisonHint}>Tap either photo to see the full image.</Text>
        </View>
        <View style={styles.comparisonFooter}><Button variant="secondary" onPress={() => setComparisonOpen(false)}>Choose another pair</Button></View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, panel: { gap: 16 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1.3 }, title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 38, lineHeight: 42 }, metricChoices: { flexDirection: "row", gap: 8 },
  checkinBoard: { padding: 17, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 14 },
  checkinBoardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  checkinBoardEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  checkinBoardTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "900", fontSize: 18, marginTop: 2 },
  checkinBoardCount: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 30 },
  checkinList: { gap: 9 },
  checkinRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 15, backgroundColor: theme.colors.subtle },
  checkinState: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
  checkinStateComplete: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand },
  checkinStateDue: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
  checkinStateText: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11 },
  checkinCopy: { flex: 1, minWidth: 0 },
  checkinTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13 },
  checkinMeta: { marginTop: 2, color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 9 },
  checkinStatus: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: 0.8 },
  checkinStatusDue: { color: theme.colors.brandStrong },
  scoreBreakdown: { padding: 17, borderRadius: 22, backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.brand, gap: 12 },
  scoreRow: { flexDirection: "row", gap: 8 },
  scoreTile: { flex: 1, minWidth: 0, padding: 11, borderRadius: 15, backgroundColor: theme.colors.surface, gap: 3 },
  scoreValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 28 },
  scoreLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 6, letterSpacing: 0.6 },
  scoreTotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.brand },
  scoreTotalLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 0.9 },
  scoreTotalValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 34 },
  summaryRow: { flexDirection: "row", gap: 8 }, summaryCard: { flex: 1, padding: 12, borderRadius: 15, backgroundColor: theme.colors.subtle, gap: 3 }, changeCard: { backgroundColor: theme.colors.accentSoft }, summaryLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 0.8 }, summaryValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, sectionTitleGroup: { gap: 3 }, sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 17 }, privateLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: 1 }, compareControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 16, backgroundColor: theme.colors.accentSoft }, compareCopy: { flex: 1, gap: 2 }, compareTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13 }, compareHint: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11 }, photos: { gap: 10, paddingVertical: 2 }, photoWrap: { width: 116, gap: 5, padding: 3, borderRadius: 19, borderWidth: 2, borderColor: "transparent" }, photoWrapSelected: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft }, photo: { width: 106, height: 142, borderRadius: 14, backgroundColor: theme.colors.subtle }, selectionBadge: { position: "absolute", top: 10, right: 10, width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: theme.colors.brand, borderWidth: 2, borderColor: "#FFFFFF" }, selectionNumber: { color: "#FFFFFF", fontFamily: theme.type.body, fontWeight: "900", fontSize: 13 }, photoCaption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }, photoDate: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "700", fontSize: 10 }, logs: { gap: 8 }, logRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, logDate: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "700", fontSize: 13 }, logMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, marginTop: 2 }, logDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  closeButton: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, viewerSafe: { flex: 1, backgroundColor: "#111418" }, viewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingBottom: 12 }, viewerHeaderCopy: { flex: 1, gap: 2 }, viewerEyebrow: { color: theme.colors.accent, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.2 }, viewerTitle: { color: "#FFFFFF", fontFamily: theme.type.body, fontWeight: "800", fontSize: 18 }, viewerClose: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.08)" }, viewerCanvas: { flex: 1 }, viewerCanvasContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8 }, viewerImage: { width: "100%", height: "100%" }, viewerFooter: { alignItems: "center", paddingHorizontal: 18, paddingTop: 14 }, viewerDock: { flexDirection: "row", alignItems: "center", gap: 18, padding: 6, borderRadius: 31, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.08)" }, viewerNavButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: theme.colors.brand }, viewerNavButtonDisabled: { opacity: 0.28, backgroundColor: "rgba(255,255,255,0.22)" }, viewerCount: { minWidth: 40, color: "rgba(255,255,255,0.78)", textAlign: "center", fontFamily: theme.type.body, fontWeight: "800", fontSize: 11 }, compareSafe: { flex: 1, backgroundColor: theme.colors.canvas }, compareHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, compareHeaderCopy: { flex: 1, gap: 2 }, compareScreenTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 36, lineHeight: 40 }, comparisonCanvas: { flex: 1, gap: 12, paddingHorizontal: 16, paddingVertical: 16 }, collageCard: { flex: 1, flexDirection: "row", overflow: "hidden", borderRadius: 28, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.subtle }, collagePane: { flex: 1, overflow: "hidden" }, collageImage: { width: "100%", height: "100%" }, collageMoment: { position: "absolute", top: 12, left: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 13, backgroundColor: "rgba(17,20,24,0.78)" }, collageMomentText: { color: "#FFFFFF", fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1 }, collageDate: { position: "absolute", right: 8, bottom: 10, left: 8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.9)" }, collageDateText: { color: theme.colors.text, textAlign: "center", fontFamily: theme.type.body, fontWeight: "800", fontSize: 10 }, collageSeam: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 3, marginLeft: -1.5, backgroundColor: theme.colors.canvas }, comparisonHint: { color: theme.colors.textMuted, textAlign: "center", fontFamily: theme.type.body, fontSize: 11 }, comparisonFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }, pressed: { opacity: 0.75 },
});
