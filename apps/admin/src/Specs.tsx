import { Alert, Box, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adminApi } from './api.js';

export const Specs = () => {
  const query = useQuery({ queryKey: ['spec'], queryFn: adminApi.spec });
  if (query.isPending) return <Typography>Loading project spec…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load the project spec. Try refreshing.</Alert>;

  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Repository specification packaged with this release.</Typography>
    <Box sx={{
      overflowWrap: 'anywhere',
      '& h1, & h2, & h3, & h4': { mt: 3, mb: 1.5 },
      '& h1': { typography: 'h4' },
      '& h2': { typography: 'h5' },
      '& h3': { typography: 'h6' },
      '& p, & ul, & ol': { lineHeight: 1.7 },
      '& pre': { overflowX: 'auto', bgcolor: 'action.hover', p: 2, borderRadius: 1 },
      '& code': { fontFamily: 'monospace' },
      '& :not(pre) > code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
      '& table': { borderCollapse: 'collapse', display: 'block', overflowX: 'auto', maxWidth: '100%' },
      '& th, & td': { border: '1px solid', borderColor: 'divider', p: 1, textAlign: 'left' },
      '& blockquote': { borderLeft: 3, borderColor: 'divider', pl: 2, ml: 0, color: 'text.secondary' },
    }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{query.data.content}</ReactMarkdown>
    </Box>
  </Paper>;
};
