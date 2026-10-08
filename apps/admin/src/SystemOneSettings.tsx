import { Alert, Stack, Typography } from '@mui/material';
import { useI18n } from './i18n.js';

export function SystemOneSettings() {
  const { t } = useI18n();
  return <Stack spacing={2}>
    <Typography variant="h6">{t("System One")}</Typography>
    <Typography variant="body2" color="text.secondary">{t("System One rewrites the outgoing System Two draft using its prompt, the four latest messages, and the draft only.")}</Typography>
    <Alert severity="info">
      <Stack spacing={0.5}>
        <Typography>{t("v1 model:")} <code>gpt-6-luna</code></Typography>
        <Typography>{t("v2 model:")} <code>gpt-6.1-sol</code></Typography>
      </Stack>
    </Alert>
  </Stack>;
}
