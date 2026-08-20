import next from 'eslint-config-next'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next(),
  {
    rules: {
      // The service-role client bypasses row-level security. Importing it into a
      // client component would ship it to the browser; `server-only` already
      // throws at build time, this makes the intent explicit in review.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/supabase/admin'],
              importNames: ['createAdminClient'],
              message:
                'The service-role client bypasses RLS. Use @/lib/supabase/server unless this is auth admin, the outbox worker, or a webhook handler.',
            },
          ],
        },
      ],
    },
  },
]
