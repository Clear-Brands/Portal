import next from 'eslint-config-next'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
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
  {
    // The three sanctioned callers of the service-role client: auth admin
    // (creating/inviting accounts), the outbox worker, and inbound webhooks.
    // roster.ts and partners.ts are both the "auth admin" case — each does its
    // own authorisation against the session-scoped client before it ever
    // reaches the admin client, and only to create or invite an auth account.
    // The GHL booking route is the "inbound webhook" case — no session exists
    // to authorise against, so a shared secret stands in for one.
    files: [
      'src/lib/actions/roster.ts',
      'src/lib/actions/partners.ts',
      'src/app/api/webhooks/ghl-booking/route.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]
