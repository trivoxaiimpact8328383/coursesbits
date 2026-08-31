import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";


/* =========================================
   CORS
========================================= */

const allowedOrigins = [
  "https://trivoxaiimpact.com",
  "https://www.trivoxaiimpact.com",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("Blocked CORS:", origin);

      return callback(
        new Error("Origin not allowed")
      );
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]
  })
);

app.use(
  express.json({
    limit: "250kb"
  })
);


/* =========================================
   CACHE
========================================= */

const aiCache = new Map();

const CACHE_TIME =
  1000 * 60 * 60;


function createCacheKey(data) {
  return [
    data.contentType,
    data.courseTitle,
    data.sectionTitle,
    data.qualification || "",
    data.language || "English"
  ]
    .join("|")
    .toLowerCase();
}


function getCachedResult(key) {
  const cached = aiCache.get(key);

  if (!cached) return null;

  const expired =
    Date.now() - cached.createdAt > CACHE_TIME;

  if (expired) {
    aiCache.delete(key);
    return null;
  }

  return cached.data;
}


function saveCache(key, data) {
  aiCache.set(key, {
    createdAt: Date.now(),
    data
  });
}


/* =========================================
   TRIVOX AI LECTURER PROMPT
========================================= */

const MASTER_SYSTEM_PROMPT = `
You are TRIVOXAI IMPACT's official AI Lecturer,
Course Content Developer,
Instructional Designer,
Assessment Creator,
and Learning Assistant.

You are not a casual chatbot.

Your job is to create professional educational
content for students based on:

- course title
- section title
- student qualification
- requested content type


=================================================
TEACHING STYLE
=================================================

Teach like an experienced lecturer.

Always:

1. Start simple.
2. Explain concepts clearly.
3. Build understanding step by step.
4. Use student-friendly English.
5. Avoid unnecessary jargon.
6. Explain technical terms when needed.
7. Use practical examples.
8. Keep content focused.
9. Avoid filler.
10. Avoid repetition.


=================================================
IMPORTANT
=================================================

Do not say:

"As an AI"
"Sure"
"Certainly"
"Here is your content"
"I can help"

Directly generate the learning material.


=================================================
TRIVOX COURSE STRUCTURE
=================================================

Every course contains multiple sections.

Every section has exactly:

STEP 1:
VIDEO

STEP 2:
SLIDES

STEP 3:
READING MATERIAL / NOTES

STEP 4:
25 BITS ASSESSMENT

The video is handled separately.

You generate:

- Slides
- Reading Material / Notes
- 25 Bits Assessment


=================================================
SLIDES
=================================================

When asked for slides:

Generate exactly 8 slides.

Each slide must contain:

- slide number
- short title
- 3 to 5 concise points

Suggested progression:

Slide 1:
Introduction

Slide 2:
Main concept

Slide 3:
Important ideas

Slide 4:
How it works

Slide 5:
Example

Slide 6:
Practical application

Slide 7:
Important points / common mistakes

Slide 8:
Summary

Slides should be concise.

Do not write long paragraphs inside slides.


=================================================
READING MATERIAL / NOTES
=================================================

When asked for notes:

Create structured reading material.

Include:

- introduction
- main concept
- important terminology
- detailed explanation
- practical example
- real-world use
- key learning points
- revision summary

The notes should make sense even if
the student did not watch the video.

Avoid unnecessarily huge content.


=================================================
BITS ASSESSMENT
=================================================

Generate exactly 25 MCQ questions.

Every question must have:

- question
- option A
- option B
- option C
- option D
- exactly one correct answer
- short explanation

Difficulty:

Questions 1-8:
Easy

Questions 9-17:
Medium

Questions 18-25:
Application / understanding based

Do not repeat questions.

Avoid confusing trick questions.


=================================================
ACCURACY
=================================================

Do not intentionally invent facts.

Do not fabricate:

- statistics
- research studies
- laws
- certifications
- company facts
- historical claims

Keep examples realistic.


=================================================
JSON OUTPUT
=================================================

When JSON is requested:

Return ONLY valid JSON.

Do not use markdown.

Do not use code fences.

Do not write anything before JSON.

Do not write anything after JSON.

The response must work with JSON.parse().
`;


/* =========================================
   PROMPT BUILDER
========================================= */

function buildPrompt({
  contentType,
  courseTitle,
  sectionTitle,
  qualification,
  language
}) {

  const safeCourse =
    String(courseTitle || "").trim();

  const safeSection =
    String(sectionTitle || "").trim();

  const safeQualification =
    String(
      qualification || "General Student"
    ).trim();

  const safeLanguage =
    String(
      language || "English"
    ).trim();


  /* =========================
     SLIDES
  ========================= */

  if (contentType === "slides") {

    return `
Create professional educational slides.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Create exactly 8 slides.

Return ONLY this JSON:

{
  "title": "Slides title",
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

Rules:

- exactly 8 slides
- each slide 3 to 5 points
- concise
- clear learning order
- no markdown
- valid JSON only
`;
  }


  /* =========================
     NOTES
  ========================= */

  if (contentType === "notes") {

    return `
Create professional reading material.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Return ONLY this JSON:

{
  "title": "Reading Material / Notes title",

  "introduction": "Short introduction",

  "sections": [
    {
      "heading": "Heading",
      "content": "Explanation"
    }
  ],

  "example": {
    "title": "Practical Example",
    "content": "Example explanation"
  },

  "keyPoints": [
    "Key point 1",
    "Key point 2"
  ],

  "revision": [
    "Revision point 1",
    "Revision point 2"
  ]
}

Rules:

- 4 to 6 note sections
- student-friendly
- clear explanation
- include practical example
- avoid filler
- valid JSON only
`;
  }


  /* =========================
     BITS
  ========================= */

  if (contentType === "bits") {

    return `
Create a 25 Bits Assessment.

COURSE:
${safeCourse}

SECTION:
${safeSection}

STUDENT LEVEL:
${safeQualification}

LANGUAGE:
${safeLanguage}

Generate exactly 25 MCQ questions.

Return ONLY this JSON:

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

Rules:

- exactly 25 questions
- four options
- only one correct answer
- correctAnswer must be A, B, C or D
- no repeated questions
- valid JSON only
`;
  }


  throw new Error(
    "Invalid content type"
  );
}


/* =========================================
   CLEAN AI JSON
========================================= */

function cleanAIJSON(text) {

  let clean =
    String(text || "").trim();

  clean = clean
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  return clean;
}


/* =========================================
   OPENROUTER CALL
========================================= */

async function callOpenRouter(
  prompt,
  attempt = 1
) {

  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing"
    );
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 30000);


  try {

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        signal: controller.signal,

        headers: {

          Authorization:
            `Bearer ${OPENROUTER_API_KEY}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://trivoxaiimpact.com",

          "X-Title":
            "TRIVOXAI IMPACT"
        },

        body: JSON.stringify({

          model:
            OPENROUTER_MODEL,

          messages: [

            {
              role: "system",
              content:
                MASTER_SYSTEM_PROMPT
            },

            {
              role: "user",
              content:
                prompt
            }

          ],

          temperature: 0.35,

          max_tokens: 7000

        })
      }
    );


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "OpenRouter Error:",
        response.status,
        data
      );


      const retryable =
        response.status === 429 ||
        response.status >= 500;


      if (
        retryable &&
        attempt < 3
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              attempt * 1200
            )
        );


        return callOpenRouter(
          prompt,
          attempt + 1
        );
      }


      throw new Error(
        data?.error?.message ||
        "OpenRouter request failed"
      );
    }


    const content =
      data?.choices?.[0]
        ?.message?.content;


    if (!content) {

      throw new Error(
        "Empty AI response"
      );
    }


    return content;


  } catch (error) {

    if (
      error.name === "AbortError" &&
      attempt < 3
    ) {

      console.log(
        "AI timeout. Retrying..."
      );


      return callOpenRouter(
        prompt,
        attempt + 1
      );
    }


    throw error;


  } finally {

    clearTimeout(timeout);

  }
}


/* =========================================
   VALIDATE AI RESULT
========================================= */

function validateGeneratedContent(
  type,
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return false;
  }


  if (type === "slides") {

    return (
      Array.isArray(result.slides) &&
      result.slides.length === 8
    );

  }


  if (type === "notes") {

    return (
      result.title &&
      Array.isArray(result.sections) &&
      result.sections.length >= 3
    );

  }


  if (type === "bits") {

    return (
      Array.isArray(
        result.questions
      ) &&
      result.questions.length === 25
    );

  }


  return false;
}


/* =========================================
   HEALTH
========================================= */

app.get("/", (req, res) => {

  res.json({

    success: true,

    service:
      "TRIVOXAI IMPACT AI Server",

    status:
      "running",

    model:
      OPENROUTER_MODEL

  });

});


app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      apiKeyConfigured:
        Boolean(
          OPENROUTER_API_KEY
        ),

      model:
        OPENROUTER_MODEL

    });

  }
);


/* =========================================
   COURSE AI ROUTE
========================================= */

app.post(
  "/api/course-ai",
  async (req, res) => {

    try {

      const {

        contentType,

        courseTitle,

        sectionTitle,

        qualification,

        language

      } = req.body;


      const allowedTypes = [
        "slides",
        "notes",
        "bits"
      ];


      if (
        !allowedTypes.includes(
          contentType
        )
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Invalid content type"

          });
      }


      if (
        !courseTitle ||
        !sectionTitle
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Course title and section title are required"

          });
      }


      /* CACHE */

      const cacheKey =
        createCacheKey({

          contentType,

          courseTitle,

          sectionTitle,

          qualification,

          language

        });


      const cached =
        getCachedResult(
          cacheKey
        );


      if (cached) {

        return res.json({

          success: true,

          cached: true,

          data: cached

        });

      }


      /* PROMPT */

      const prompt =
        buildPrompt({

          contentType,

          courseTitle,

          sectionTitle,

          qualification,

          language

        });


      /* OPENROUTER */

      const aiText =
        await callOpenRouter(
          prompt
        );


      /* CLEAN JSON */

      const cleaned =
        cleanAIJSON(
          aiText
        );


      let parsed;


      try {

        parsed =
          JSON.parse(cleaned);

      } catch (error) {

        console.error(
          "Invalid JSON:",
          cleaned
        );


        return res
          .status(502)
          .json({

            success: false,

            error:
              "AI returned invalid JSON. Please retry."

          });

      }


      /* VALIDATE */

      if (
        !validateGeneratedContent(
          contentType,
          parsed
        )
      ) {

        return res
          .status(502)
          .json({

            success: false,

            error:
              "Generated content validation failed."

          });

      }


      /* CACHE SAVE */

      saveCache(
        cacheKey,
        parsed
      );


      return res.json({

        success: true,

        cached: false,

        type:
          contentType,

        course:
          courseTitle,

        section:
          sectionTitle,

        data:
          parsed

      });


    } catch (error) {

      console.error(
        "Course AI Error:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          error:
            "Unable to generate course content right now."

        });

    }

  }
);


/* =========================================
   404
========================================= */

app.use((req, res) => {

  res.status(404).json({

    success: false,

    error:
      "Route not found"

  });

});


/* =========================================
   START SERVER
========================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `TRIVOXAI IMPACT AI Server running on port ${PORT}`
    );

    console.log(
      `Model: ${OPENROUTER_MODEL}`
    );

  }
);
