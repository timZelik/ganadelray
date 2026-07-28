# Sample TikTok Analytics Transcript — @ganadelray
# Ingestion test fixture. Source: Gemini-transcribed TikTok Studio screenshots.
# Captured ~Jul 27, 2026 (screenshot clocks 09:27 and 10:34–10:38).
# Use this to verify analyticsIngestor.js (parse) and the ranked converter table (step 3).
#
# CRITICAL PARSING NOTES:
# - Captions are TRUNCATED (end in "..."). Use as prefix identity anchor.
# - Dates are mixed: absolute ("Posted on Jun 3, 2025") and relative ("2w ago", "1mo ago").
#   Resolve relative dates against the capture date above.
# - The SAME video recurs across windows (7/28/60/365d) with DIFFERENT counts.
#   These are separate observations, not overwrites.
# - Two different metrics appear. WATCH THE UNIT:
#     "new viewers"   = reach       (Most new viewers tab)
#     "new followers" = conversion  (New followers tab) <-- THE north-star
#   Same video shows wildly different numbers per metric (CalDiet: 4.9M viewers vs 542 followers).

## METRIC: NEW FOLLOWERS (north-star) — window: 7 days
1. 4 apartment hacks that will save you time & money 🤍 #home #apartment... | 65 | 2w ago
2. 🤍 #home #apartment #money #furniture #affordable | 15 | Posted on Jun 9
3. all the costs of moving 📦 link to all my furniture in my bio as well as the free... | 12 | 3w ago
4. part 2 of 4 apartment hacks that will save you time + money 🤍 #money #h... | 10 | 6d ago
5. Shera Seven's most important lessons (part 5) 🤍 follow for a part 6 #sheras... | 10 | 1w ago
6. all items are in the link below (in order) #apartment #home #moving #money... | 10 | 1mo ago
7. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 10 | Posted on Dec 4, 2025
8. weights + bands will enhance these workouts but they are not necessary! t... | 8 | Posted on Jun 3, 2025
9. most important lessons learned from Shera Seven #sheraseven #advice #d... | 5 | 2w ago
10. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 5 | Posted on Jun 11

## METRIC: NEW FOLLOWERS — window: 28 days
1. 4 apartment hacks that will save you time & money 🤍 #home #apartment... | 104 | 2w ago
2. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 80 | Posted on Jun 11
3. 🤍 #home #apartment #money #furniture #affordable | 58 | Posted on Jun 9
4. all items are in the link below (in order) #apartment #home #moving #money... | 49 | 1mo ago
5. all amazon items are in my storefront (now including the coffee table that i fi... | 39 | Posted on May 12
6. all the costs of moving 📦 link to all my furniture in my bio as well as the free... | 30 | 3w ago
7. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 26 | Posted on Dec 4, 2025
8. shera seven's most important lessons (part 3) #datingadvice #girls #datingti... | 24 | 2w ago
9. weights + bands will enhance these workouts but they are not necessary! t... | 24 | Posted on Jun 3, 2025
10. most important lessons learned from Shera Seven #sheraseven #advice #d... | 21 | 2w ago

## METRIC: NEW FOLLOWERS — window: 60 days
1. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 274 | Posted on Jun 11
2. all amazon items are in my storefront (now including the coffee table that i fi... | 113 | Posted on May 12
3. 4 apartment hacks that will save you time & money 🤍 #home #apartment... | 104 | 2w ago
4. 🤍 #home #apartment #money #furniture #affordable | 91 | Posted on Jun 9
5. things you should rly do before moving into your new apartment that will save... | 75 | Posted on Mar 13
6. weights + bands will enhance these workouts but they are not necessary! t... | 66 | Posted on Jun 3, 2025
7. my favorite tech items and what I use them for 🤍 (first 4 are under $100) #t... | 63 | Posted on Apr 24
8. 4 for 4 btw #oliviarodrigo #music #songs #fyp | 56 | Posted on Jun 7
9. part 1 of items I bought for my apartment (what I ordered vs. got) on... | 51 | Posted on May 20
10. all items are in the link below (in order) #apartment #home #moving #money... | 49 | 1mo ago

## METRIC: NEW FOLLOWERS — window: 365 days
1. weights + bands will enhance these workouts but they are not necessary! t... | 717 | Posted on Jun 3, 2025
2. things you should rly do before moving into your new apartment that will save... | 633 | Posted on Mar 13
3. 3 days free trial #caldiet @CalDiet App | 542 | Posted on Dec 24, 2025
4. Replying to @Alexis Jane demos of each machine that will help you actuall... | 424 | Posted on Jun 4, 2025
5. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 360 | Posted on Dec 4, 2025
6. i was onto something here 🤌🤌 #moving #shipping #fyp #relateable #... | 327 | Posted on Feb 21
7. bc why does it kinda lowkey make sense #fyp #relatable #cleantok #cleaning #... | 294 | Posted on Dec 5, 2025
8. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 274 | Posted on Jun 11
9. my favorite tech items and what I use them for 🤍 (first 4 are under $100) #t... | 270 | Posted on Apr 24
10. i did it successfully twice after this lol #fyp #apartment #adulting #moving #... | 242 | Posted on Feb 28

## METRIC: NEW VIEWERS (reach — secondary, for the conversion-gap calc) — window: 7 days
1. 4 apartment hacks that will save you time & money 🤍 #home #apartment... | 14000 | 2w ago
2. weights + bands will enhance these workouts but they are not necessary! t... | 9234 | Posted on Jun 3, 2025
3. all items are in the link below (in order) #apartment #home #moving #money... | 7717 | 1mo ago
4. lmk if you think there's a better one for a certain category #credit #creditcard... | 7031 | Posted on Jun 16
5. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 6430 | Posted on Dec 4, 2025
6. is it just me that thinks about this at the beach. i get so fascinated with the gig... | 3890 | Posted on Jul 4, 2025
7. how to mount your TV to the wall in a renter friendly, quick, and easy way!... | 3679 | Posted on Feb 28
8. very affordable + pretty pieces 🤍 follow for the next parts #moving #ap... | 2898 | Posted on Apr 21
9. why I chose the YSL LE 5 À 7 in smooth leather 🖤 haven't been this excited a... | 2891 | Posted on May 22
10. things you should rly do before moving into your new apartment that will save... | 2885 | Posted on Mar 13

## METRIC: NEW VIEWERS (reach) — window: 28 days
1. is it just me that thinks about this at the beach. i get so fascinated with the gig... | 144000 | Posted on Jul 4, 2025
2. weights + bands will enhance these workouts but they are not necessary! t... | 49000 | Posted on Jun 3, 2025
3. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 48000 | Posted on Jun 11
4. lmk if you think there's a better one for a certain category #credit #creditcard... | 31000 | Posted on Jun 16
5. all items are in the link below (in order) #apartment #home #moving #money... | 28000 | 1mo ago
6. 4 apartment hacks that will save you time & money 🤍 #home #apartment... | 22000 | 2w ago
7. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 21000 | Posted on Dec 4, 2025
8. link in bio 🤍 #RingConn #JessieJ #RingConnGen3 #SmartRing #Vascul... | 14000 | Posted on Jun 12
9. how to mount your TV to the wall in a renter friendly, quick, and easy way!... | 14000 | Posted on Feb 28
10. all amazon items are in my storefront (now including the coffee table that i fi... | 14000 | Posted on May 12

## METRIC: NEW VIEWERS (reach) — window: 60 days
1. i've been going back/forth on getting the Bilt card - so lmk if you have that/i... | 201000 | Posted on Jun 11
2. is it just me that thinks about this at the beach. i get so fascinated with the gig... | 144000 | Posted on Jul 4, 2025
3. 4 for 4 btw #oliviarodrigo #music #songs #fyp | 101000 | Posted on Jun 7
4. all amazon items are in my storefront (now including the coffee table that i fi... | 93000 | Posted on May 12
5. lmk if you think there's a better one for a certain category #credit #creditcard... | 53000 | Posted on Jun 16
6. weights + bands will enhance these workouts but they are not necessary! t... | 49000 | Posted on Jun 3, 2025
7. everything is from Amazon & under $100 (linked in my storefront in my bio... | 38000 | Posted on May 11
8. all items are in the link below (in order) #apartment #home #moving #money... | 28000 | 1mo ago
9. part 1 of items I bought for my apartment (what I ordered vs. got) on... | 25000 | Posted on May 20
10. why I chose the YSL LE 5 À 7 in smooth leather 🖤 haven't been this excited a... | 23000 | Posted on May 22

## METRIC: NEW VIEWERS (reach) — window: 365 days
1. 3 days free trial #caldiet @CalDiet App | 4900000 | Posted on Dec 24, 2025
2. bc why does it kinda lowkey make sense #fyp #relatable #cleantok #cleaning #... | 1700000 | Posted on Dec 5, 2025
3. i was onto something here 🤌🤌 #moving #shipping #fyp #relateable #... | 1100000 | Posted on Feb 21
4. that security deposit is mineeee #adulting #apartment #home #diy #gi... | 802000 | Posted on Feb 9
5. i did it successfully twice after this lol #fyp #apartment #adulting #moving #... | 688000 | Posted on Feb 28
6. is it just me that thinks about this at the beach. i get so fascinated with the gig... | 677000 | Posted on Jul 4, 2025
7. the immediate cut after was perfect #warfare #filmtok #movies #movie #fi... | 363000 | Posted on Sep 13, 2025
8. things you should rly do before moving into your new apartment that will save... | 309000 | Posted on Mar 13
9. nothing like orange chicken & chow mein from Panda <3 #pandaexpress... | 301000 | Posted on Dec 4, 2025
10. Apple let me move in peace pleasee #relatable #fyp #funny #viral #iphone | 294000 | Posted on Nov 13, 2025

## ACCOUNT-LEVEL CONTEXT (from Overview / Followers tabs)
# Total followers (all time): 9,323
# Net followers 60d: ~1.1K   |   Net followers 365d: ~5.4K
# Audience: 81% female / 19% male (followers); 85% female (viewers)
# Followers most active: ~7pm (peak observed Jul 26, 7pm = 3.1K active)
# Traffic source (60d): For You 56.1% / Search 41.1% — note heavy Search share
