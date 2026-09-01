import express from "express";
import cors from "cors";

const app = express();

/* =========================================================
   BASIC CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

const SLIDES_OPENROUTER_API_KEY =
  process.env.SLIDES_OPENROUTER_API_KEY || "";

const NOTES_OPENROUTER_API_KEY =
  process.env.NOTES_OPENROUTER_API_KEY || "";

const BITS_OPENROUTER_API_KEY =
  process.env.BITS_OPENROUTER_API_KEY || "";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const SITE_URL =
  process.env.SITE_URL || "https://trivoxaiimpact.com";


function getOpenRouterApiKey(contentType) {

  if (contentType === "slides") {
    return SLIDES_OPENROUTER_API_KEY;
  }

  if (contentType === "notes") {
    return NOTES_OPENROUTER_API_KEY;
  }

  if (contentType === "bits") {
    return BITS_OPENROUTER_API_KEY;
  }

  return OPENROUTER_API_KEY;
}


const REQUEST_TIMEOUT_MS = 45000;
const MAX_AI_ATTEMPTS = 3;
const CACHE_TIME_MS = 1000 * 60 * 60; // 1 hour


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
  "https://trivoxaiimpact.com",
  "https://www.trivoxaiimpact.com",
  "https://coursesbits.onrender.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.use(
  cors({
    origin(origin, callback) {

      // Allow server-to-server, curl, Postman,
      // direct browser navigation.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        "Blocked CORS origin:",
        origin
      );

      return callback(
        new Error(
          `CORS blocked for origin: ${origin}`
        )
      );
    },

    methods: [
      "GET",
      "POST",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],

    maxAge: 86400
  })
);


app.use(
  express.json({
    limit: "300kb"
  })
);


/* =========================================================
   REQUEST LOG
========================================================= */

app.use(
  (req, res, next) => {

    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );

    next();
  }
);


/* =========================================================
   MEMORY CACHE
========================================================= */

const aiCache =
  new Map();


function createCacheKey(data) {

  return [
    data.contentType || "",
    data.courseTitle || "",
    data.sectionTitle || "",
    data.qualification || "",
    data.language || "English"
  ]
    .map(
      value =>
        String(value)
          .trim()
          .toLowerCase()
    )
    .join("|");
}


function getCachedResult(key) {

  const cached =
    aiCache.get(key);

  if (!cached) {
    return null;
  }

  if (
    Date.now() -
      cached.createdAt >
    CACHE_TIME_MS
  ) {

    aiCache.delete(key);

    return null;
  }

  return cached.data;
}


function saveCache(
  key,
  data
) {

  aiCache.set(
    key,
    {
      createdAt:
        Date.now(),

      data
    }
  );
}


/* =========================================================
   TRIVOX MASTER AI LECTURER PROMPT
========================================================= */

const MASTER_SYSTEM_PROMPT = `
You are TRIVOXAI IMPACT's official AI Lecturer,
Senior Course Designer,
Instructional Designer,
Subject Explainer,
Reading Material Writer,
Slide Creator,
Assessment Creator,
and Learning Quality Reviewer.

You are not a casual chatbot.

You work as part of a real online learning platform.

Your responsibility is to generate course material that is:
- accurate
- clear
- student-friendly
- practical
- progressive
- non-repetitive
- useful for actual learning
- suitable for the student's level


=================================================
CORE TEACHING BEHAVIOUR
=================================================

Teach like an experienced lecturer.

Always follow this teaching sequence:

1. Identify what the student must understand.
2. Start from the simplest required idea.
3. Build concepts gradually.
4. Explain important terminology.
5. Use clear practical examples.
6. Connect theory to real-world use.
7. Highlight mistakes or misconceptions when useful.
8. End with a useful learning summary.
9. Keep the content aligned with the course title.
10. Keep the content aligned with the current section.
11. Match the student's qualification level.
12. Never wander into unrelated topics.


=================================================
TRIVOXAI COURSE STRUCTURE
=================================================

Each course contains multiple sections.

Each section has exactly four learning steps:

STEP 1
VIDEO

STEP 2
SLIDES

STEP 3
READING MATERIAL / NOTES

STEP 4
25 BITS ASSESSMENT

The video is handled separately by the platform.

You are responsible for:
- Slides
- Reading Material / Notes
- 25 Bits Assessment


=================================================
CONSISTENCY BETWEEN STEPS
=================================================

Slides, Notes and Assessment must belong to the SAME section.

The assessment must test concepts taught in:
- the section video context
- the section slides
- the section notes

Do not generate assessment questions unrelated to the section.

Do not introduce advanced concepts in the assessment
that were never explained in the learning material.


=================================================
SLIDES QUALITY RULES
=================================================

When generating slides:

Generate exactly 8 slides.

Each slide must have:
- slideNumber
- title
- 3 to 5 concise points

Recommended learning progression:

Slide 1:
Introduction and learning objective

Slide 2:
Core concept

Slide 3:
Important terms or building blocks

Slide 4:
How the concept works

Slide 5:
Simple practical example

Slide 6:
Real-world or practical application

Slide 7:
Important points, common mistakes or best practices

Slide 8:
Quick summary and revision

Slide rules:

- Keep points short.
- Avoid long paragraphs.
- Avoid repeating the same sentence.
- Avoid generic filler.
- Use concrete explanations.
- Make each slide useful.
- Do not add fake facts.
- Do not add citations unless explicitly requested.
- Do not use markdown.
- Do not use HTML.
- Return valid JSON only.


=================================================
READING MATERIAL / NOTES QUALITY RULES
=================================================

Reading material should be more detailed than slides.

The notes must be understandable even if the student
has not watched the video.

Include:

1. Short introduction
2. Main concept
3. Important terminology
4. Clear explanation
5. Step-by-step explanation where relevant
6. Practical example
7. Real-world use
8. Common mistake or important caution when relevant
9. Key learning points
10. Quick revision

Notes should:
- be clear
- be structured
- avoid excessive length
- avoid filler
- avoid repetition
- use simple professional English
- match the student's level

Do not make every section sound identical.


=================================================
25 BITS ASSESSMENT RULES
=================================================

Generate exactly 25 multiple-choice questions.

Every question must include:
- number
- question
- four options: A, B, C, D
- exactly one correctAnswer
- short explanation

Difficulty distribution:

Questions 1 to 8:
Easy understanding

Questions 9 to 17:
Medium understanding

Questions 18 to 25:
Application and concept understanding

Assessment rules:

- No duplicate questions.
- No duplicate answer options inside one question.
- No trick questions.
- Avoid vague wording.
- Correct answer must be one of A, B, C, D.
- Explanation must clearly justify the answer.
- Questions must come from the current section.
- Mix conceptual and practical questions.
- Do not make the correct option always the same letter.
- Spread correct answers reasonably across A, B, C and D.


=================================================
STUDENT LEVEL ADAPTATION
=================================================

If qualification is school-level:
- use simpler language
- use simple examples
- explain terminology carefully

If qualification is Intermediate:
- use moderate detail
- include practical reasoning

If qualification is Degree/BCA/PG:
- use professional terminology where useful
- still explain concepts clearly
- include applied examples

Never restrict content only because of qualification.
Qualification is used only to adjust teaching depth.


=================================================
FACTUAL ACCURACY
=================================================

Never intentionally invent facts.

Do not fabricate:
- statistics
- research papers
- government rules
- laws
- certifications
- company facts
- historical facts
- technical specifications

If exact factual detail is not necessary,
teach the concept without inventing data.


=================================================
WRITING STYLE
=================================================

Use:
- simple professional English
- short clear sentences
- meaningful explanations
- direct teaching language

Do NOT start with:
"Sure"
"Certainly"
"As an AI"
"Here is your content"
"I can help"
"Of course"

Do not talk about being an AI.

Do not include conversational filler.


=================================================
JSON OUTPUT RULE
=================================================

When JSON is requested:

Return ONLY valid JSON.

Never wrap JSON in markdown code fences.

Do not write text before JSON.

Do not write text after JSON.

Do not include comments inside JSON.

Use double quotes for JSON keys and string values.

The response must be directly parseable using JSON.parse().
`;


/* =========================================================
   SAFE INPUT
========================================================= */

function safeText(
  value,
  fallback = ""
) {

  return String(
    value ?? fallback
  )
    .trim()
    .slice(
      0,
      300
    );
}


/* =========================================================
   PROMPT BUILDER
========================================================= */

function buildPrompt({
  contentType,
  courseTitle,
  sectionTitle,
  qualification,
  language
}) {

  const safeCourse =
    safeText(
      courseTitle
    );


  const safeSection =
    safeText(
      sectionTitle
    );


  const safeQualification =
    safeText(
      qualification,
      "General Student"
    );


  const safeLanguage =
    safeText(
      language,
      "English"
    );


  if (
    contentType ===
      "slides"
  ) {

    return `
TASK:
Generate the SLIDES for one TRIVOXAI course section.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Create exactly 8 slides.

Return ONLY this JSON structure:

{
  "title": "Section slides title",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Slide title",
      "points": [
        "Point 1",
        "Point 2",
        "Point 3"
      ]
    }
  ]
}

STRICT RULES:
- exactly 8 slide objects
- slideNumber must be 1 to 8
- every slide needs 3 to 5 points
- points must be concise
- no empty titles
- no markdown
- no HTML
- valid JSON only
`;
  }


  if (
    contentType ===
      "notes"
  ) {

    return `
TASK:
Generate professional Reading Material / Notes
for one TRIVOXAI course section.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Return ONLY this JSON structure:

{
  "title": "Reading Material / Notes title",
  "introduction": "Short introduction",
  "sections": [
    {
      "heading": "Heading",
      "content": "Clear explanation"
    }
  ],
  "example": {
    "title": "Practical Example",
    "content": "Example explanation"
  },
  "keyPoints": [
    "Important point 1",
    "Important point 2"
  ],
  "revision": [
    "Revision point 1",
    "Revision point 2"
  ]
}

STRICT RULES:
- 4 to 6 useful note sections
- clear introduction
- practical example
- minimum 4 keyPoints
- minimum 4 revision points
- no filler
- no markdown
- no HTML
- valid JSON only
`;
  }


  if (
    contentType ===
      "bits"
  ) {

    return `
TASK:
Generate the final 25 Bits Assessment
for one TRIVOXAI course section.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Return ONLY this JSON structure:

{
  "title": "25 Bits Assessment",
  "questions": [
    {
      "number": 1,
      "question": "Question text",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correctAnswer": "A",
      "explanation": "Short explanation"
    }
  ]
}

STRICT RULES:
- exactly 25 questions
- question numbers 1 to 25
- every question must have A, B, C and D
- only one correct answer
- correctAnswer must be A, B, C or D
- explanation required
- no duplicate questions
- no markdown
- no HTML
- valid JSON only
`;
  }


  throw new Error(
    "Invalid content type"
  );
}


/* =========================================================
   JSON CLEANER
========================================================= */

function cleanAIJSON(text) {

  let clean =
    String(
      text || ""
    ).trim();


  clean =
    clean
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();


  const firstBrace =
    clean.indexOf("{");


  const lastBrace =
    clean.lastIndexOf("}");


  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace >
      firstBrace
  ) {

    clean =
      clean.slice(
        firstBrace,
        lastBrace + 1
      );
  }


  return clean;
}


/* =========================================================
   OPENROUTER REQUEST
========================================================= */

async function callOpenRouter(
  prompt,
  contentType,
  attempt = 1
) {

  const apiKey =
    getOpenRouterApiKey(
      contentType
    );


  if (!apiKey) {

    throw new Error(
      `${String(
        contentType ||
          "OPENROUTER"
      ).toUpperCase()} API key is missing in Render Environment Variables.`
    );

  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );


  try {

    const response =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {

          method:
            "POST",


          signal:
            controller.signal,


          headers: {

            Authorization:
              `Bearer ${apiKey}`,


            "Content-Type":
              "application/json",


            "HTTP-Referer":
              SITE_URL,


            "X-Title":
              "TRIVOXAI IMPACT"

          },


          body:
            JSON.stringify({

              model:
                OPENROUTER_MODEL,


              messages: [

                {
                  role:
                    "system",

                  content:
                    MASTER_SYSTEM_PROMPT
                },

                {
                  role:
                    "user",

                  content:
                    prompt
                }

              ],


              temperature:
                0.25,


              max_tokens:
                8000

            })

        }
      );


    const rawText =
      await response.text();


    let data = null;


    try {

      data =
        JSON.parse(
          rawText
        );

    } catch {

      console.error(
        "OpenRouter non-JSON response:",
        rawText.slice(
          0,
          1000
        )
      );

    }


    if (
      !response.ok
    ) {

      const message =
        data?.error?.message ||
        rawText ||
        `OpenRouter HTTP ${response.status}`;


      console.error(
        "OpenRouter Error:",
        response.status,
        message
      );


      const retryable =
        response.status ===
          408 ||
        response.status ===
          409 ||
        response.status ===
          429 ||
        response.status >=
          500;


      if (
        retryable &&
        attempt <
          MAX_AI_ATTEMPTS
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              attempt *
                1500
            )
        );


        return callOpenRouter(
          prompt,
          contentType,
          attempt + 1
        );

      }


      throw new Error(
        message
      );
    }


    const content =
      data?.choices?.[0]
        ?.message?.content;


    if (!content) {

      if (
        attempt <
          MAX_AI_ATTEMPTS
      ) {

        return callOpenRouter(
          prompt,
          contentType,
          attempt + 1
        );

      }


      throw new Error(
        "OpenRouter returned an empty response."
      );
    }


    return content;


  } catch (error) {


    if (
      error.name ===
        "AbortError" &&
      attempt <
        MAX_AI_ATTEMPTS
    ) {

      console.warn(
        `OpenRouter timeout. Retry ${
          attempt + 1
        }/${MAX_AI_ATTEMPTS}`
      );


      return callOpenRouter(
        prompt,
        contentType,
        attempt + 1
      );

    }


    throw error;


  } finally {

    clearTimeout(
      timeout
    );

  }
}


/* =========================================================
   CONTENT VALIDATION
========================================================= */

function validateSlides(
  result
) {

  if (
    !result ||
    !Array.isArray(
      result.slides
    ) ||
    result.slides.length !==
      8
  ) {

    return false;
  }


  return result.slides.every(
    (
      slide,
      index
    ) => {

      return (

        Number(
          slide.slideNumber
        ) ===
          index + 1 &&


        typeof slide.title ===
          "string" &&


        slide.title
          .trim()
          .length >
          0 &&


        Array.isArray(
          slide.points
        ) &&


        slide.points.length >=
          3 &&


        slide.points.length <=
          5

      );

    }
  );
}


function validateNotes(
  result
) {

  return Boolean(

    result &&

    typeof result.title ===
      "string" &&

    typeof result.introduction ===
      "string" &&

    Array.isArray(
      result.sections
    ) &&

    result.sections.length >=
      4 &&

    result.sections.length <=
      6 &&

    result.example &&

    Array.isArray(
      result.keyPoints
    ) &&

    result.keyPoints.length >=
      4 &&

    Array.isArray(
      result.revision
    ) &&

    result.revision.length >=
      4

  );
}


function validateBits(
  result
) {

  if (
    !result ||
    !Array.isArray(
      result.questions
    ) ||
    result.questions.length !==
      25
  ) {

    return false;
  }


  const allowedAnswers =
    new Set([
      "A",
      "B",
      "C",
      "D"
    ]);


  const normalizedQuestions =
    new Set();


  for (
    let i = 0;
    i <
      result.questions.length;
    i++
  ) {

    const item =
      result.questions[i];


    if (

      Number(
        item.number
      ) !==
        i + 1 ||

      !item.question ||

      !item.options ||

      !item.options.A ||

      !item.options.B ||

      !item.options.C ||

      !item.options.D ||

      !allowedAnswers.has(
        String(
          item.correctAnswer
        ).toUpperCase()
      ) ||

      !item.explanation

    ) {

      return false;
    }


    const normalized =
      String(
        item.question
      )
        .trim()
        .toLowerCase();


    if (
      normalizedQuestions.has(
        normalized
      )
    ) {

      return false;
    }


    normalizedQuestions.add(
      normalized
    );

  }


  return true;
}


function validateGeneratedContent(
  type,
  result
) {

  if (
    type ===
      "slides"
  ) {

    return validateSlides(
      result
    );
  }


  if (
    type ===
      "notes"
  ) {

    return validateNotes(
      result
    );
  }


  if (
    type ===
      "bits"
  ) {

    return validateBits(
      result
    );
  }


  return false;
}


/* =========================================================
   GENERATE + PARSE + RETRY INVALID JSON
========================================================= */

async function generateValidatedContent(
  contentType,
  prompt
) {

  let lastError =
    null;


  for (
    let attempt = 1;
    attempt <=
      MAX_AI_ATTEMPTS;
    attempt++
  ) {

    try {

      const aiText =
        await callOpenRouter(
          prompt,
          contentType
        );


      const cleaned =
        cleanAIJSON(
          aiText
        );


      const parsed =
        JSON.parse(
          cleaned
        );


      if (
        validateGeneratedContent(
          contentType,
          parsed
        )
      ) {

        return parsed;
      }


      lastError =
        new Error(
          "Generated content did not match the required structure."
        );


    } catch (error) {

      lastError =
        error;


      console.warn(
        `Generation validation attempt ${attempt} failed:`,
        error.message
      );

    }
  }


  throw (
    lastError ||
    new Error(
      "AI generation failed."
    )
  );
}


/* =========================================================
   ROOT / HEALTH ROUTES
========================================================= */

app.get(
  "/",
  (req, res) => {

    return res
      .status(200)
      .json({

        success:
          true,


        service:
          "TRIVOXAI IMPACT AI Server",


        status:
          "running",


        model:
          OPENROUTER_MODEL,


        endpoints: {

          health:
            "GET /api/health",

          courseAI:
            "POST /api/course-ai"

        }

      });
  }
);


app.get(
  "/api/health",
  (req, res) => {

    return res
      .status(200)
      .json({

        success:
          true,


        status:
          "healthy",


        apiKeyConfigured:
          Boolean(
            OPENROUTER_API_KEY
          ),


        model:
          OPENROUTER_MODEL,


        cacheEntries:
          aiCache.size

      });

  }
);


/* =========================================================
   MAIN COURSE AI ROUTE
========================================================= */

async function courseAIHandler(
  req,
  res
) {

  try {

    const {

      contentType,

      courseTitle,

      sectionTitle,

      qualification,

      language

    } =
      req.body || {};


    const type =
      safeText(
        contentType
      ).toLowerCase();


    const allowedTypes = [
      "slides",
      "notes",
      "bits"
    ];


    if (
      !allowedTypes.includes(
        type
      )
    ) {

      return res
        .status(400)
        .json({

          success:
            false,


          error:
            "contentType must be slides, notes or bits."

        });
    }


    if (

      !safeText(
        courseTitle
      ) ||

      !safeText(
        sectionTitle
      )

    ) {

      return res
        .status(400)
        .json({

          success:
            false,


          error:
            "courseTitle and sectionTitle are required."

        });

    }


    const requestData = {

      contentType:
        type,


      courseTitle:
        safeText(
          courseTitle
        ),


      sectionTitle:
        safeText(
          sectionTitle
        ),


      qualification:
        safeText(
          qualification,
          "General Student"
        ),


      language:
        safeText(
          language,
          "English"
        )

    };


    const cacheKey =
      createCacheKey(
        requestData
      );


    const cached =
      getCachedResult(
        cacheKey
      );


    if (cached) {

      return res.json({

        success:
          true,


        cached:
          true,


        type:
          requestData
            .contentType,


        course:
          requestData
            .courseTitle,


        section:
          requestData
            .sectionTitle,


        data:
          cached

      });

    }


    const prompt =
      buildPrompt(
        requestData
      );


    const generated =
      await generateValidatedContent(
        requestData.contentType,
        prompt
      );


    saveCache(
      cacheKey,
      generated
    );


    return res.json({

      success:
        true,


      cached:
        false,


      type:
        requestData
          .contentType,


      course:
        requestData
          .courseTitle,


      section:
        requestData
          .sectionTitle,


      data:
        generated

    });


  } catch (error) {


    console.error(
      "Course AI Error:",
      error
    );


    return res
      .status(500)
      .json({

        success:
          false,


        error:
          "Unable to generate course content right now.",


        details:
          process.env.NODE_ENV ===
            "production"
            ? undefined
            : error.message

      });

  }
}


app.post(
  "/api/course-ai",
  courseAIHandler
);


// Extra alias so accidental trailing/alternate path still works.
app.post(
  "/api/course-ai/",
  courseAIHandler
);


/* =========================================================
   SIMPLE CACHE CLEAR
   Optional: useful after changing prompts/content.
========================================================= */

app.post(
  "/api/cache/clear",
  (req, res) => {

    aiCache.clear();


    return res.json({

      success:
        true,


      message:
        "AI memory cache cleared."

    });

  }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {


    console.error(
      "Express Error:",
      error
    );


    if (

      String(
        error?.message ||
          ""
      ).startsWith(
        "CORS blocked"
      )

    ) {

      return res
        .status(403)
        .json({

          success:
            false,


          error:
            "CORS origin not allowed."

        });

    }


    return res
      .status(500)
      .json({

        success:
          false,


        error:
          "Server error."

      });

  }
);


/* =========================================================
   404 - MUST STAY AFTER ALL ROUTES
========================================================= */

app.use(
  (req, res) => {

    return res
      .status(404)
      .json({

        success:
          false,


        error:
          "Route not found",


        method:
          req.method,


        path:
          req.originalUrl

      });

  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `TRIVOXAI IMPACT AI Server running on port ${PORT}`
    );


    console.log(
      `Model: ${OPENROUTER_MODEL}`
    );


    console.log(
      `API key configured: ${Boolean(
        OPENROUTER_API_KEY
      )}`
    );

  }
);
