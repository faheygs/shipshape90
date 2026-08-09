import { ChoiceChip, theme } from "@shipshape/ui-mobile";
import { Text, TextInput, View } from "react-native";
import { visibilityOptions } from "./challengeCreationModel";
import { sharedStyles, StepHero } from "./ChallengeCreationFields";
import type { ChallengeBuilder } from "./useChallengeBuilder";

export function BasicsStep({ builder }: { builder: ChallengeBuilder }) {
  return <>
    <StepHero eyebrow="START WITH THE IDEA" title="What are we doing?" subtitle="Give people one clear reason to show up every day." />
    <View style={sharedStyles.card}>
      <View style={sharedStyles.field}><Text style={sharedStyles.label}>CHALLENGE NAME</Text><TextInput value={builder.name} onChangeText={builder.setName} placeholder="90 Strong" placeholderTextColor={theme.colors.textMuted} maxLength={80} returnKeyType="next" style={sharedStyles.input} /></View>
      <View style={sharedStyles.field}><Text style={sharedStyles.label}>SHORT DESCRIPTION</Text><TextInput value={builder.description} onChangeText={builder.setDescription} placeholder="What are people committing to?" placeholderTextColor={theme.colors.textMuted} multiline maxLength={1000} style={[sharedStyles.input, sharedStyles.textarea]} /></View>
    </View>
    <View style={sharedStyles.centerSection}>
      <Text style={sharedStyles.sectionTitle}>Who can join?</Text>
      <View style={sharedStyles.centerChoices}>{visibilityOptions.map((item) => <ChoiceChip key={item} label={item === "public" ? "Anyone" : "Invite only"} selected={builder.visibility === item} onPress={() => builder.setVisibility(item)} />)}</View>
      <Text style={sharedStyles.helpCentered}>{builder.visibility === "public" ? "Visible to everyone in Explore. Anyone can join." : "A private code is created automatically. People with it can request to join."}</Text>
    </View>
  </>;
}
