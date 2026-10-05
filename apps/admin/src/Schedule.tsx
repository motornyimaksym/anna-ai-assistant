import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
import { Alert, Box, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

const failedSync = new Set(['source_not_found', 'disconnected', 'account_busy', 'connection_failed', 'timeout']);

export function Schedule() {
  const { t, language } = useI18n();
  const formatKyiv = (value: string) => new Date(value).toLocaleString(language === 'uk' ? 'uk-UA' : 'en-US', { timeZone: 'Europe/Kyiv' });
  const query = useQuery({ queryKey: ['telegram-schedule-slots'], queryFn: adminApi.telegramScheduleSlots, refetchInterval: 60_000 });
  return <Box>
    <Typography variant="h6" gutterBottom>{t("Imported free slots")}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {t("Read-only messages from the connected Telegram account. Refresh runs on incoming messages, at most once every five minutes.")}</Typography>
    {query.isPending ? <Typography>{t("Loading imported slots…")}</Typography> : query.isError ? <Alert severity="error">{t("Could not load imported schedule slots.")}</Alert> : <Stack spacing={2}>
      <ScheduleSyncStatus data={query.data} />

      {query.data.slots.length ? <List aria-label={t("Imported free slots")} disablePadding>
        {query.data.slots.map((slot) => <ListItem key={slot.messageId} divider alignItems="flex-start" disableGutters>
          <ListItemText primary={slot.text} secondary={`${t("Telegram message")} · ${formatKyiv(slot.createdAt)} (${t("Europe/Kyiv")})`} />
        </ListItem>)}
      </List> : <Alert severity="info">{t("No imported free slots yet. Select the source chat in Bot Settings, then refresh when the cooldown allows.")}</Alert>}
      <Typography variant="h6">{t("Calendar busy times")}</Typography>
      {!query.data.calendarAvailability ? <Alert severity={failedSync.has(query.data.status ?? '') ? 'warning' : 'info'}>
        {failedSync.has(query.data.status ?? '') ? t("Calendar snapshot needs a successful sync. See the diagnostic above and retry when permitted.")
          : query.data.nextAttemptAt && Date.parse(query.data.nextAttemptAt) > Date.now() ? `${t("No Calendar snapshot yet. Refresh did not start a new import during the five-minute cooldown. Next permitted refresh:")} ${formatKyiv(query.data.nextAttemptAt)} (${t("Europe/Kyiv")}).`
            : t("No Calendar snapshot yet. Refresh the schedule to load it.")}
      </Alert>
        : query.data.calendarAvailability.status === 'unavailable' ? <Alert severity="warning">{t("Calendar was unavailable during the last sync (")}{formatKyiv(query.data.calendarAvailability.checkedAt)}{t("). Refresh to try again.")}</Alert>
          : <Stack spacing={1}>
            <Typography variant="body2">{t("Checked:")}{t(" ")}{formatKyiv(query.data.calendarAvailability.checkedAt)} {t(" ")}{t("· Coverage:")}{t(" ")}{formatKyiv(query.data.calendarAvailability.rangeStart)} – {formatKyiv(query.data.calendarAvailability.rangeEnd)} {t(" ")}{t("(Europe/Kyiv)")}</Typography>
            <Typography variant="body2" color="text.secondary">{t("Read-only busy periods. Booking availability is checked live.")}</Typography>
            {query.data.calendarAvailability.busy.length ? <List aria-label={t("Calendar busy times")} disablePadding>
              {query.data.calendarAvailability.busy.map((interval, index) => <ListItem key={`${interval.start}-${interval.end}-${index}`} divider disableGutters>
                <ListItemText primary={`${formatKyiv(interval.start)} – ${formatKyiv(interval.end)} (${t("Europe/Kyiv")})`} />
              </ListItem>)}
            </List> : <Alert severity="info">{t("No busy periods in the synchronized Calendar range.")}</Alert>}
          </Stack>}
    </Stack>}
  </Box>;
}
