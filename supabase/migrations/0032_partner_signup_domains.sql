-- 0032_partner_signup_domains.sql
--
-- Self-serve signup, per Cristian's request on the shared doc: a rep or
-- partner admin should be able to create their own portal credentials,
-- matched to a partner automatically by their email's domain (e.g.
-- someone@fieldpulse.com -> FieldPulse). If no partner has a matching
-- domain configured, account creation is refused rather than left
-- ownerless.
--
-- This is the domain list each partner is willing to auto-match against.
-- Defaults to empty, so self-serve signup stays off for every existing
-- partner until Clear Brands turns it on for them from Partner Settings —
-- nothing about today's invite-only flow changes on its own.

alter table partners
  add column signup_domains text[] not null default '{}';

comment on column partners.signup_domains is
  'Email domains (lowercase, no leading @) that auto-match a self-serve signup to this partner. Empty means self-serve signup is off for this partner.';
