export type ScheduleDialogCandidate = {
  id?: { toString(): string } | string | number;
  title?: string;
  name?: string;
  isGroup?: boolean;
  isChannel?: boolean;
};

const keywordGroups = [
  ['календар', 'calendar'],
  ['планування', 'план', 'planning', 'schedule'],
  ['час', 'часу', 'time'],
] as const;
const ignoredWords = new Set(['та', 'і', 'й', 'the', 'and']);
const words = (value: string) => value.normalize('NFKC').toLocaleLowerCase('uk-UA').match(/[\p{L}\p{N}]+/gu)?.filter((word) => !ignoredWords.has(word)) ?? [];
const peerId = (dialog: ScheduleDialogCandidate) => dialog.id?.toString();
const titleScore = (title: string) => {
  const titleWords = words(title);
  return keywordGroups.filter((group) => group.some((keyword) => titleWords.some((word) => word === keyword || (word.length >= 4 && (word.startsWith(keyword) || keyword.startsWith(word)))))).length;
};

export function findScheduleDialog<T extends ScheduleDialogCandidate>(dialogs: readonly T[], sourcePeerId?: string): T | undefined {
  if (sourcePeerId) return dialogs.find((dialog) => peerId(dialog) === sourcePeerId);
  const groupDialogs = dialogs.filter((dialog) => dialog.isGroup || dialog.isChannel);
  const candidates = groupDialogs.map((dialog) => ({ dialog, score: titleScore(dialog.title ?? dialog.name ?? '') })).filter(({ score }) => score >= 2);
  if (!candidates.length) return undefined;
  candidates.sort((left, right) => right.score - left.score);
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score) return undefined;
  return candidates[0]!.dialog;
}
