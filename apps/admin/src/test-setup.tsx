import { createElement, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { LocaleProvider } from './i18n.js';

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  return {
    ...actual,
    render: (ui: ReactNode, options?: Parameters<typeof actual.render>[1]) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      });
      const ExistingWrapper = options?.wrapper as
        | ComponentType<{ children: ReactNode }>
        | undefined;
      const TestProviders = ({ children }: { children: ReactNode }) => (
        <LocaleProvider>
          <QueryClientProvider client={client}>
            {ExistingWrapper
              ? createElement(ExistingWrapper, { children })
              : children}
          </QueryClientProvider>
        </LocaleProvider>
      );

      return actual.render(ui, { ...options, wrapper: TestProviders });
    },
  };
});
