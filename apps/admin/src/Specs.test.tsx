// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Specs } from './Specs.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { spec: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><Specs /></QueryClientProvider>);

describe('admin specs page', () => {
  it('renders the repository spec as Markdown', async () => {
    vi.mocked(adminApi.spec).mockResolvedValue({ content: '# Project spec\n\n| Item | State |\n| --- | --- |\n| Prompt | Ready |' });
    show();
    expect(await screen.findByRole('heading', { name: 'Project spec' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Repository specification packaged with this release.')).toBeTruthy();
  });

  it('shows a load error', async () => {
    vi.mocked(adminApi.spec).mockRejectedValue(new Error('Denied'));
    show();
    expect(await screen.findByText(/Could not load the project spec/)).toBeTruthy();
  });
});
