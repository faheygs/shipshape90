export type OtpDestination = { kind: "email"; value: string };

export interface Profile {
  id: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  timeZone: string;
}
