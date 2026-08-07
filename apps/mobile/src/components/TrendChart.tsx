import { theme } from "@shipshape/ui-mobile";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function TrendChart({ data, suffix = "" }: { data: { date: string; value: number }[]; suffix?: string }) {
  if (!data.length) return <View style={styles.empty}><View style={styles.emptyOrb}/><Text style={styles.emptyTitle}>Your graph is ready.</Text><Text style={styles.emptyBody}>Add the first log to drop a checkpoint on the board.</Text></View>;
  const width = 340; const height = 190; const padX = 20; const padY = 22;
  const values = data.map((item) => item.value); const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, Math.max(max * 0.03, 1));
  const points = data.length === 1 ? [{ x: width / 2, y: height / 2 }] : data.map((item, index) => ({ x: padX + (index / (data.length - 1)) * (width - padX * 2), y: padY + ((max - item.value) / range) * (height - padY * 2) }));
  const linePath = data.length === 1 ? `M${padX} ${points[0].y} L${width - padX} ${points[0].y}` : points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L${width - padX} ${height - padY} L${padX} ${height - padY} Z`;
  const first = data[0]; const latest = data[data.length - 1]; const change = latest.value - first.value;
  return <View style={styles.wrap}>
    <View style={styles.chartTop}><View><Text style={styles.kicker}>LIVE TREND</Text><Text style={styles.latest}>{latest.value}{suffix}</Text></View><View style={[styles.delta, change <= 0 && styles.deltaDown]}><Text style={styles.deltaLabel}>{change > 0 ? "+" : ""}{Number(change.toFixed(2))}{suffix}</Text><Text style={styles.deltaMeta}>FROM START</Text></View></View>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs><SvgLinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={theme.colors.brand} stopOpacity="0.28"/><Stop offset="1" stopColor={theme.colors.brand} stopOpacity="0"/></SvgLinearGradient></Defs>
      {[0.25,0.5,0.75,1].map((ratio)=><Line key={ratio} x1={padX} y1={padY+(height-padY*2)*ratio} x2={width-padX} y2={padY+(height-padY*2)*ratio} stroke={theme.colors.borderStrong} strokeWidth={1} strokeDasharray="4 6"/>)}
      <Path d={areaPath} fill="url(#trendFill)"/><Path d={linePath} fill="none" stroke={theme.colors.brand} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point,index)=><Circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index===points.length-1?7:4} fill={index===points.length-1?theme.colors.brand:theme.colors.surface} stroke={index===points.length-1?theme.colors.surface:theme.colors.brand} strokeWidth={2.5}/>)}
    </Svg>
    <View style={styles.axis}><Text style={styles.axisText}>{shortDate(first.date)}</Text><View style={styles.checkpoints}><Text style={styles.checkpointValue}>{data.length}</Text><Text style={styles.checkpointLabel}>CHECKPOINT{data.length===1?"":"S"}</Text></View><Text style={styles.axisText}>{shortDate(latest.date)}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap:{padding:17,borderRadius:24,borderWidth:1,borderColor:theme.colors.brand,backgroundColor:theme.colors.brandSoft,overflow:"hidden",shadowColor:theme.colors.brand,shadowOpacity:.08,shadowRadius:16,shadowOffset:{width:0,height:8},elevation:2},chartTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:2},kicker:{color:theme.colors.brandStrong,fontFamily:theme.type.body,fontWeight:"900",fontSize:8,letterSpacing:1.3},latest:{color:theme.colors.text,fontFamily:theme.type.display,fontSize:42,lineHeight:44},delta:{alignItems:"flex-end",paddingHorizontal:11,paddingVertical:8,borderRadius:14,backgroundColor:theme.colors.surface,borderWidth:1,borderColor:theme.colors.accent},deltaDown:{borderColor:theme.colors.brand,backgroundColor:theme.colors.accentSoft},deltaLabel:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:13},deltaMeta:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontWeight:"900",fontSize:6,letterSpacing:.9},axis:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:-3},axisText:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontSize:9},checkpoints:{flexDirection:"row",alignItems:"baseline",gap:4},checkpointValue:{color:theme.colors.brandStrong,fontFamily:theme.type.display,fontSize:20},checkpointLabel:{color:theme.colors.textMuted,fontFamily:theme.type.body,fontWeight:"900",fontSize:6,letterSpacing:.8},empty:{minHeight:230,alignItems:"center",justifyContent:"center",padding:24,borderRadius:24,borderWidth:1,borderColor:theme.colors.accent,backgroundColor:theme.colors.accentSoft,gap:6},emptyOrb:{width:64,height:64,marginBottom:5,borderRadius:32,borderWidth:12,borderColor:theme.colors.brand,backgroundColor:theme.colors.accent},emptyTitle:{color:theme.colors.text,fontFamily:theme.type.body,fontWeight:"900",fontSize:17},emptyBody:{maxWidth:250,color:theme.colors.textSecondary,fontFamily:theme.type.body,fontSize:12,lineHeight:18,textAlign:"center"},
});
