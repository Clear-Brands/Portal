From cdc13dd61f438f9bd2d1693e27d8a2a4396f3af4 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Sat, 29 Aug 2026 11:10:41 +0000
Subject: [PATCH] Accept GET on the GHL booking webhook, not just POST

Live testing showed GHL's workflow Webhook action arriving as a GET
against this route twice in a row, immediately after re-selecting and
re-saving Method: POST in GHL's own builder -- the route only accepted
POST, so both attempts failed with 405 and no deal was created.

Rather than keep fighting GHL's builder, accept either verb: POST still
reads the JSON body as before, GET reads the identical field set from
the URL query string, and both funnel into the same handleBooking logic.
---
 src/app/api/webhooks/ghl-booking/route.ts | 51 ++++++++++++++++++++---
 1 file changed, 46 insertions(+), 5 deletions(-)

diff --git a/src/app/api/webhooks/ghl-booking/route.ts b/src/app/api/webhooks/ghl-booking/route.ts
index 7dbb725..9cd9df8 100644
--- a/src/app/api/webhooks/ghl-booking/route.ts
+++ b/src/app/api/webhooks/ghl-booking/route.ts
@@ -38,6 +38,15 @@ import { createAdminClient } from '@/lib/supabase/admin'
  * The partner is which My deals booking link this came from, not something
  * GHL can be trusted to declare on its own — it's a query-string slug on the
  * webhook URL itself: .../api/webhooks/ghl-booking?partner=fieldpulse
+ *
+ * GHL's workflow "Webhook" action lets you pick a Method in its own UI, but
+ * in practice the outbound request doesn't reliably honor that choice — a
+ * live test against this route saw a POST-configured action arrive as a
+ * GET twice in a row, immediately after re-selecting and re-saving "POST".
+ * Rather than fight GHL's builder further, this route accepts either verb:
+ * POST reads the payload from the JSON body as documented above, GET reads
+ * the identical shape from the URL's query string (?contact_id=...&rep_
+ * email=...), and both funnel into the same handler below.
  */
 
 type BookingPayload = {
@@ -69,11 +78,6 @@ export async function POST(request: NextRequest) {
     return Response.json({ error: 'Unauthorized' }, { status: 401 })
   }
 
-  const partnerSlug = request.nextUrl.searchParams.get('partner') ?? ''
-  if (!partnerSlug) {
-    return Response.json({ error: 'Missing ?partner= on the webhook URL' }, { status: 400 })
-  }
-
   let body: BookingPayload
   try {
     body = (await request.json()) as BookingPayload
@@ -81,6 +85,43 @@ export async function POST(request: NextRequest) {
     return Response.json({ error: 'Body was not valid JSON' }, { status: 400 })
   }
 
+  return handleBooking(request, body)
+}
+
+// See the file-level comment above: GHL's Webhook action has been observed
+// firing a GET despite the action being configured and saved as POST, so
+// this is a second, equally-trusted entry point rather than a fallback for
+// misconfiguration. A GET carries no body, so the same fields are read from
+// the query string instead — everything after ?partner=... on the webhook
+// URL that isn't `partner` itself.
+export async function GET(request: NextRequest) {
+  if (!secretMatches(request)) {
+    return Response.json({ error: 'Unauthorized' }, { status: 401 })
+  }
+
+  const params = request.nextUrl.searchParams
+  const body: BookingPayload = {
+    contact_id: params.get('contact_id') ?? undefined,
+    first_name: params.get('first_name') ?? undefined,
+    last_name: params.get('last_name') ?? undefined,
+    email: params.get('email') ?? undefined,
+    phone: params.get('phone') ?? undefined,
+    company_name: params.get('company_name') ?? undefined,
+    city: params.get('city') ?? undefined,
+    state: params.get('state') ?? undefined,
+    notes: params.get('notes') ?? undefined,
+    rep_email: params.get('rep_email') ?? undefined,
+  }
+
+  return handleBooking(request, body)
+}
+
+async function handleBooking(request: NextRequest, body: BookingPayload) {
+  const partnerSlug = request.nextUrl.searchParams.get('partner') ?? ''
+  if (!partnerSlug) {
+    return Response.json({ error: 'Missing ?partner= on the webhook URL' }, { status: 400 })
+  }
+
   const admin = createAdminClient()
 
   // Every delivery is stored raw first, whatever happens next — a mapping bug
-- 
2.43.0

