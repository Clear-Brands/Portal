-- 0023_deals_company.sql
-- A company name for the referral's client — GHL booking webhook fills this in
-- from the booking form; the manual submit flows leave it blank, same as any
-- other optional contact detail.

alter table deals add column company text not null default '';
