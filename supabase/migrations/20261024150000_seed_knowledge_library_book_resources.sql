-- Ensure the Knowledge Library table exists in clean migration-test databases.
-- Existing production installations keep their current table and policies.
CREATE TABLE IF NOT EXISTS public.knowledge_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  title_bn text,
  summary text,
  summary_bn text,
  content text,
  content_bn text,
  category text NOT NULL DEFAULT 'general',
  resource_type text NOT NULL DEFAULT 'article',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  language text DEFAULT 'both',
  source_name text,
  source_url text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_resources ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'knowledge_resources'
      AND policyname = 'Published knowledge resources are readable'
  ) THEN
    CREATE POLICY "Published knowledge resources are readable"
      ON public.knowledge_resources
      FOR SELECT TO anon, authenticated
      USING (is_published = true);
  END IF;
END $$;

-- Seed original, bilingual field handbooks so the Knowledge Library has
-- published book-style resources on a fresh or existing CivilOS AI database.
-- Idempotent by slug: re-running this migration does not create duplicates.

INSERT INTO public.knowledge_resources
  (slug, title, title_bn, summary, summary_bn, content, content_bn, category,
   resource_type, tags, language, source_name, source_url, is_published)
SELECT
  'civil-site-inspection-handbook',
  'Civil Site Inspection Handbook',
  'সিভিল সাইট ইন্সপেকশন হ্যান্ডবুক',
  'A practical field guide for checking setting-out, foundations, reinforcement, formwork, concrete placement and site records.',
  'সেটিং-আউট, ফাউন্ডেশন, রড, শাটারিং, কংক্রিট ঢালাই ও সাইট রেকর্ড যাচাইয়ের ব্যবহারিক গাইড।',
  $book$
CIVIL SITE INSPECTION HANDBOOK

Purpose
Use this as a general field checklist alongside the approved drawings, project specifications, method statements and instructions from the responsible engineer. It is not a substitute for project-specific approval.

1. Before work starts
- Confirm the latest approved drawing revision and site grid/benchmark.
- Check dimensions, offsets, levels and boundaries before excavation or setting-out.
- Confirm underground utilities, access, barricades and required PPE.
- Record discrepancies and obtain written clarification before proceeding.

2. Foundation and reinforcement
- Compare footing, column and beam locations with approved drawings.
- Check reinforcement diameter, spacing, number, laps, anchorage, cover blocks and cleanliness against the drawings/specification.
- Verify formwork dimensions, line, level, bracing, tight joints and safe access.
- Do not cut, bend, relocate or splice reinforcement without authorization.

3. Concrete pre-pour checks
- Complete the pre-pour inspection and obtain required approval.
- Confirm approved mix, delivery arrangements, equipment, vibration plan and test arrangements.
- Check formwork stability, embedded items, openings, reinforcement and access.
- Record delivery time, batch details, test results and any rejected load.

4. During and after placement
- Place and compact concrete using the approved method; avoid uncontrolled free fall and segregation.
- Monitor formwork movement and stop work if unsafe movement or failure is suspected.
- Protect fresh concrete and follow the specified curing method and duration.
- Do not remove formwork or load members until authorized.

5. Records and non-conformance
- Record date, weather, location, inspected activity, responsible persons and photographs.
- Raise a non-conformance for deviations; state the location, evidence, immediate control and proposed corrective action.
- Close the item only after the responsible person verifies the correction.

Safety note
Follow the site's approved safety plan and applicable codes. Structural acceptance must be made by the responsible qualified engineer.
$book$,
  $bookbn$
সিভিল সাইট ইন্সপেকশন হ্যান্ডবুক

উদ্দেশ্য
এই গাইডটি সাধারণ সাইট চেকলিস্ট হিসেবে ব্যবহার করুন। অনুমোদিত ড্রয়িং, প্রকল্পের স্পেসিফিকেশন, মেথড স্টেটমেন্ট এবং দায়িত্বপ্রাপ্ত ইঞ্জিনিয়ারের নির্দেশই চূড়ান্ত। এটি প্রকল্পভিত্তিক অনুমোদনের বিকল্প নয়।

১. কাজ শুরুর আগে
- সর্বশেষ অনুমোদিত ড্রয়িং ও সাইটের গ্রিড/বেঞ্চমার্ক যাচাই করুন।
- খনন বা সেটিং-আউটের আগে মাপ, অফসেট, লেভেল ও সীমানা পরীক্ষা করুন।
- ভূগর্ভস্থ ইউটিলিটি, চলাচলের পথ, ব্যারিকেড ও PPE নিশ্চিত করুন।
- ড্রয়িংয়ের সঙ্গে অমিল থাকলে কাজ এগোনোর আগে লিখিত ব্যাখ্যা নিন।

২. ফাউন্ডেশন ও রড
- ফুটিং, কলাম ও বিমের অবস্থান অনুমোদিত ড্রয়িংয়ের সঙ্গে মিলিয়ে দেখুন।
- রডের ব্যাস, স্পেসিং, সংখ্যা, ল্যাপ, অ্যাঙ্করেজ, কভার ব্লক ও পরিষ্কার-পরিচ্ছন্নতা স্পেসিফিকেশন অনুযায়ী যাচাই করুন।
- শাটারিংয়ের মাপ, লাইন, লেভেল, ব্রেসিং, জয়েন্ট ও নিরাপদ প্রবেশপথ দেখুন।
- অনুমতি ছাড়া রড কাটা, বাঁকানো, সরানো বা স্প্লাইস পরিবর্তন করবেন না।

৩. কংক্রিট ঢালাইয়ের আগে
- প্রি-পোর ইন্সপেকশন সম্পন্ন করে প্রয়োজনীয় অনুমোদন নিন।
- অনুমোদিত মিক্স, সরবরাহ, যন্ত্রপাতি, ভাইব্রেশন ও টেস্টের ব্যবস্থা নিশ্চিত করুন।
- শাটারিং, এমবেডেড আইটেম, ওপেনিং, রড ও কাজের প্রবেশপথ পরীক্ষা করুন।
- ডেলিভারির সময়, ব্যাচের তথ্য, পরীক্ষার ফল ও বাতিল লোডের রেকর্ড রাখুন।

৪. ঢালাই চলাকালে ও পরে
- অনুমোদিত পদ্ধতিতে কংক্রিট বসান ও কম্প্যাকশন করুন; সেগ্রিগেশন এড়িয়ে চলুন।
- শাটারিং বিপজ্জনকভাবে নড়লে কাজ বন্ধ করে নিরাপত্তা নিশ্চিত করুন।
- নতুন কংক্রিট সুরক্ষিত রাখুন এবং নির্ধারিত পদ্ধতি ও সময় অনুযায়ী কিউরিং করুন।
- দায়িত্বপ্রাপ্ত ব্যক্তির অনুমতি ছাড়া শাটারিং খুলবেন না বা সদস্যে লোড দেবেন না।

৫. রেকর্ড ও ত্রুটি
- তারিখ, আবহাওয়া, কাজের স্থান, পরীক্ষা, দায়িত্বপ্রাপ্ত ব্যক্তি ও ছবি সংরক্ষণ করুন।
- অমিল হলে স্থান, প্রমাণ, তাৎক্ষণিক নিয়ন্ত্রণ ও সংশোধনী ব্যবস্থা উল্লেখ করে নন-কনফরম্যান্স রেকর্ড করুন।
- সংশোধন যাচাইয়ের পরই আইটেমটি বন্ধ করুন।

নিরাপত্তা নোট
সাইটের অনুমোদিত নিরাপত্তা পরিকল্পনা ও প্রযোজ্য কোড অনুসরণ করুন। কাঠামোগত গ্রহণযোগ্যতার সিদ্ধান্ত দায়িত্বপ্রাপ্ত যোগ্য ইঞ্জিনিয়ার দেবেন।
$bookbn$,
  'qa_qc', 'guide',
  ARRAY['book','handbook','site inspection','foundation','reinforcement','concrete','quality'],
  'both', 'CivilOS AI Original Field Guide', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_resources WHERE slug = 'civil-site-inspection-handbook'
);

INSERT INTO public.knowledge_resources
  (slug, title, title_bn, summary, summary_bn, content, content_bn, category,
   resource_type, tags, language, source_name, source_url, is_published)
SELECT
  'quantity-surveying-boq-field-handbook',
  'Quantity Surveying & BOQ Field Handbook',
  'কোয়ান্টিটি সার্ভে ও BOQ ফিল্ড হ্যান্ডবুক',
  'A workflow for drawing take-off, measurement sheets, BOQ descriptions, assumptions, cross-checks and transparent quantity records.',
  'ড্রয়িং থেকে পরিমাণ নির্ণয়, মেজারমেন্ট শিট, BOQ বর্ণনা, অনুমান ও পরিমাণ যাচাইয়ের গাইড।',
  $book$
QUANTITY SURVEYING & BOQ FIELD HANDBOOK

1. Establish the measurement basis
- Use the latest approved drawings and identify the revision/date on the take-off sheet.
- Record units consistently (m, m², m³, kg, or item) and follow the applicable standard method of measurement and contract.
- Separate measured quantities from assumptions, provisional items and exclusions.

2. Organize the take-off
- Break work into clear sections: substructure, frame, masonry, finishes, services and external works.
- Give each item a unique reference linked to a drawing/detail and location.
- Show dimensions and arithmetic, not only the final quantity.
- For repeated elements, state the count and dimensions of a typical element and the repetition basis.

3. Prepare BOQ descriptions
- Describe the work, material/grade, workmanship, unit and scope inclusions clearly.
- Avoid vague descriptions such as “all complete” unless the contract defines them.
- Keep demolition, disposal, testing, temporary works and other inclusions explicit where relevant.
- Confirm the BOQ wording against the contract and local measurement rules.

4. Cross-check quantities
- Compare floor areas, storey counts, grids and structural schedules across drawings.
- Reconcile concrete volume with member dimensions and reinforcement quantities with the approved bar schedule.
- Check openings, deductions, laps, wastage and measurement rules consistently; do not apply a blanket percentage without justification.
- Independently recheck high-value or high-risk items.

5. Rate and estimate transparency
- Separate material, labour, equipment, transport, overheads, taxes and profit according to the estimate format.
- Record source, date, location and validity of market rates.
- State exclusions, contingency assumptions and price basis.
- Keep a revision log when drawings or rates change.

Reminder
Quantities and prices are estimates until reviewed against the actual contract, drawings, local measurement standards and current market quotations.
$book$,
  $bookbn$
কোয়ান্টিটি সার্ভে ও BOQ ফিল্ড হ্যান্ডবুক

১. পরিমাপের ভিত্তি ঠিক করুন
- সর্বশেষ অনুমোদিত ড্রয়িং ব্যবহার করুন এবং টেক-অফ শিটে রিভিশন ও তারিখ লিখুন।
- একক ধারাবাহিক রাখুন (m, m², m³, kg বা item) এবং প্রযোজ্য মেজারমেন্ট স্ট্যান্ডার্ড ও চুক্তি অনুসরণ করুন।
- মাপা পরিমাণ, অনুমান, প্রভিশনাল আইটেম ও বাদ দেওয়া কাজ আলাদা করে দেখান।

২. টেক-অফ সাজান
- কাজকে সাবস্ট্রাকচার, ফ্রেম, গাঁথুনি, ফিনিশিং, সার্ভিস ও বাহিরের কাজে ভাগ করুন।
- প্রতিটি আইটেমের ইউনিক রেফারেন্স, ড্রয়িং/ডিটেইল ও অবস্থান দিন।
- শুধু চূড়ান্ত পরিমাণ নয়—মাত্রা ও হিসাবও দেখান।
- একই ধরনের একাধিক আইটেম হলে সংখ্যা, একটি আইটেমের মাপ ও পুনরাবৃত্তির ভিত্তি লিখুন।

৩. BOQ বর্ণনা তৈরি করুন
- কাজের ধরন, উপকরণ/গ্রেড, কাজের মান, একক ও অন্তর্ভুক্ত কাজ স্পষ্টভাবে লিখুন।
- চুক্তিতে সংজ্ঞায়িত না থাকলে “সব কাজসহ” ধরনের অস্পষ্ট বর্ণনা এড়িয়ে চলুন।
- প্রয়োজনমতো ভাঙা, অপসারণ, পরীক্ষা, অস্থায়ী কাজ ও অন্যান্য অন্তর্ভুক্তি স্পষ্ট করুন।
- BOQ-এর ভাষা চুক্তি ও স্থানীয় মেজারমেন্ট নিয়মের সঙ্গে মিলিয়ে নিন।

৪. পরিমাণ যাচাই করুন
- ড্রয়িংয়ের ফ্লোর এরিয়া, তলার সংখ্যা, গ্রিড ও স্ট্রাকচারাল শিডিউল মিলিয়ে দেখুন।
- কংক্রিটের ভলিউম সদস্যের মাপের সঙ্গে এবং রডের পরিমাণ অনুমোদিত বার বেন্ডিং শিডিউলের সঙ্গে মিলিয়ে দেখুন।
- ওপেনিং, ডিডাকশন, ল্যাপ, অপচয় ও মেজারমেন্ট নিয়ম ধারাবাহিকভাবে প্রয়োগ করুন; যুক্তি ছাড়া সবার জন্য একই শতাংশ ব্যবহার করবেন না।
- বেশি খরচ বা ঝুঁকির আইটেম আলাদাভাবে পুনরায় যাচাই করুন।

৫. রেট ও এস্টিমেটের স্বচ্ছতা
- এস্টিমেটের ফরম্যাট অনুযায়ী উপকরণ, শ্রম, যন্ত্রপাতি, পরিবহন, ওভারহেড, কর ও মুনাফা আলাদা করুন।
- বাজারদরের উৎস, তারিখ, স্থান ও কার্যকারিতা লিখুন।
- বাদ দেওয়া কাজ, কন্টিনজেন্সি অনুমান ও মূল্য নির্ধারণের ভিত্তি উল্লেখ করুন।
- ড্রয়িং বা রেট বদলালে রিভিশন লগ রাখুন।

মনে রাখুন
প্রকৃত চুক্তি, ড্রয়িং, স্থানীয় মেজারমেন্ট স্ট্যান্ডার্ড ও বর্তমান বাজারদর যাচাই না করা পর্যন্ত পরিমাণ ও মূল্য অনুমানমাত্র।
$bookbn$,
  'estimation_boq', 'guide',
  ARRAY['book','handbook','BOQ','quantity takeoff','estimation','measurement','rate analysis'],
  'both', 'CivilOS AI Original Field Guide', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_resources WHERE slug = 'quantity-surveying-boq-field-handbook'
);

INSERT INTO public.knowledge_resources
  (slug, title, title_bn, summary, summary_bn, content, content_bn, category,
   resource_type, tags, language, source_name, source_url, is_published)
SELECT
  'reinforcement-and-bbs-quick-handbook',
  'Reinforcement & Bar Bending Schedule Handbook',
  'রড ও বার বেন্ডিং শিডিউল হ্যান্ডবুক',
  'A practical guide to reading reinforcement drawings, recording bar marks, checking cutting lengths and validating steel quantities.',
  'রডের ড্রয়িং পড়া, বার মার্ক, কাটিং লেন্থ ও স্টিলের পরিমাণ যাচাইয়ের ব্যবহারিক গাইড।',
  $book$
REINFORCEMENT & BAR BENDING SCHEDULE HANDBOOK

1. Read before calculating
- Identify member marks, bar marks, bar diameter, spacing, shape, quantity and drawing revision.
- Follow the approved reinforcement detailing and applicable code; do not infer missing anchorage, hooks or lap lengths.
- Confirm cover, support conditions and congestion with the responsible engineer when unclear.

2. Build a traceable BBS
- Assign a unique bar mark and link it to member/location and drawing detail.
- Record diameter, shape code where applicable, number of bars, cutting length and total length.
- Show the calculation for each cutting length using the approved shape/detailing rules.
- Keep bar marks consistent between the drawing, BBS, fabrication and site delivery records.

3. Steel mass estimate
- A common nominal estimate for the mass per metre of a reinforcing bar is d²/162 kg/m, where d is the nominal diameter in millimetres. It is an estimate; use the applicable standard mass table and project specification for final procurement and billing.
- Total estimated mass = number of bars × cutting length in metres × nominal mass per metre.
- Keep bar diameters and units consistent, and avoid mixing millimetres and metres in one calculation.

4. Site verification
- Check bar diameter, count, spacing, lap/anchorage, bends, cover and cleanliness against approved drawings.
- Confirm fabrication dimensions and tolerances with the approved BBS and project specification.
- Reconcile delivered, cut, installed and remaining steel by bar mark; document approved wastage assumptions separately.

5. Safety and changes
- Use safe lifting, storage and cutting/bending practices.
- Any change to bar size, spacing, lap, anchorage or reinforcement arrangement requires approval by the responsible structural engineer.
- This handbook is a field aid, not a substitute for structural design or approved detailing.
$book$,
  $bookbn$
রড ও বার বেন্ডিং শিডিউল হ্যান্ডবুক

১. হিসাবের আগে ড্রয়িং পড়ুন
- মেম্বার মার্ক, বার মার্ক, রডের ব্যাস, স্পেসিং, শেপ, সংখ্যা ও ড্রয়িং রিভিশন শনাক্ত করুন।
- অনুমোদিত রড ডিটেইলিং ও প্রযোজ্য কোড অনুসরণ করুন; ল্যাপ বা অ্যাঙ্করেজের তথ্য না থাকলে নিজে থেকে ধরে নেবেন না।
- কভার, সাপোর্ট ও রডের জটিলতা অস্পষ্ট হলে দায়িত্বপ্রাপ্ত ইঞ্জিনিয়ারের সঙ্গে নিশ্চিত করুন।

২. যাচাইযোগ্য BBS তৈরি করুন
- প্রতিটি বার মার্ককে মেম্বার/অবস্থান ও ড্রয়িং ডিটেইলের সঙ্গে যুক্ত করুন।
- ব্যাস, শেপ কোড (প্রযোজ্য হলে), রডের সংখ্যা, কাটিং লেন্থ ও মোট দৈর্ঘ্য লিখুন।
- অনুমোদিত শেপ/ডিটেইলিং নিয়ম অনুযায়ী প্রতিটি কাটিং লেন্থের হিসাব দেখান।
- ড্রয়িং, BBS, ফ্যাব্রিকেশন ও সাইট ডেলিভারিতে বার মার্ক একই রাখুন।

৩. স্টিলের ওজনের আনুমানিক হিসাব
- রডের প্রতি মিটারের নামমাত্র ওজনের একটি প্রচলিত আনুমানিক সূত্র হলো d²/162 kg/m; এখানে d হলো মিলিমিটারে নামমাত্র ব্যাস। এটি অনুমান—চূড়ান্ত ক্রয় ও বিলিংয়ের জন্য প্রযোজ্য স্ট্যান্ডার্ডের ওজন-তালিকা ও প্রকল্পের স্পেসিফিকেশন ব্যবহার করুন।
- আনুমানিক মোট ওজন = রডের সংখ্যা × কাটিং লেন্থ (মিটার) × প্রতি মিটারের নামমাত্র ওজন।
- ব্যাস ও একক ধারাবাহিক রাখুন; একই হিসাবে মিলিমিটার ও মিটার মিশিয়ে ফেলবেন না।

৪. সাইটে যাচাই
- অনুমোদিত ড্রয়িং অনুযায়ী ব্যাস, সংখ্যা, স্পেসিং, ল্যাপ/অ্যাঙ্করেজ, বাঁক, কভার ও পরিষ্কার-পরিচ্ছন্নতা পরীক্ষা করুন।
- অনুমোদিত BBS ও প্রকল্পের স্পেসিফিকেশন অনুযায়ী ফ্যাব্রিকেশনের মাপ ও সহনশীলতা যাচাই করুন।
- বার মার্ক ধরে সরবরাহ, কাটা, বসানো ও অবশিষ্ট রডের হিসাব মিলিয়ে নিন; অনুমোদিত অপচয়ের হিসাব আলাদা রাখুন।

৫. নিরাপত্তা ও পরিবর্তন
- রড তোলা, সংরক্ষণ, কাটা ও বাঁকানোর সময় নিরাপদ পদ্ধতি অনুসরণ করুন।
- রডের ব্যাস, স্পেসিং, ল্যাপ, অ্যাঙ্করেজ বা বিন্যাস পরিবর্তনের আগে দায়িত্বপ্রাপ্ত স্ট্রাকচারাল ইঞ্জিনিয়ারের অনুমোদন নিন।
- এই হ্যান্ডবুকটি সাইট সহায়িকা; স্ট্রাকচারাল ডিজাইন বা অনুমোদিত ডিটেইলিংয়ের বিকল্প নয়।
$bookbn$,
  'rcc_steel', 'guide',
  ARRAY['book','handbook','reinforcement','BBS','bar bending schedule','steel weight'],
  'both', 'CivilOS AI Original Field Guide', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_resources WHERE slug = 'reinforcement-and-bbs-quick-handbook'
);
