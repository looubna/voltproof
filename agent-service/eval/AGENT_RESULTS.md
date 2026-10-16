# Evidence agent evaluation (live)

Ran 2026-10-16T13:58:58+00:00 · agent 2026.10.1 · gemini-2.5-flash (investigator, drafter) · gemini-2.5-pro (forensic analyst) · synthetic demo cases.

**36/36 behaviour checks passed.**

| Case | Flagged docs | Forensic reports | Steps | Gemini calls | Questions / issuer requests | Dropped | Time | Checks |
|---|---|---|---|---|---|---|---|---|
| demo-hero-id3 | 1 | 1 | 12 | 4 | 3 / 1 | 0 | 48.9 s | 9/9 |
| demo-tampered-kona | 3 | 3 | 11 | 5 | 5 / 2 | 0 | 44.4 s | 9/9 |
| demo-tesla-model3 | 0 | 0 | 15 | 4 | 4 / 1 | 0 | 110.1 s | 9/9 |
| demo-kia-ev6 | 0 | 0 | 9 | 2 | 2 / 1 | 0 | 13.6 s | 9/9 |

## Checks

- **demo-hero-id3**: ✓ run stored; ✓ both registry lookups ran; ✓ forensic analyst ran iff documents flagged; ✓ every flagged document explained; ✓ explanations cite only raised indicators; ✓ every draft cites findings; ✓ no verdict words; ✓ tool calls ≤ 8; ✓ finished in < 150 s
- **demo-tampered-kona**: ✓ run stored; ✓ both registry lookups ran; ✓ forensic analyst ran iff documents flagged; ✓ every flagged document explained; ✓ explanations cite only raised indicators; ✓ every draft cites findings; ✓ no verdict words; ✓ tool calls ≤ 8; ✓ finished in < 150 s
- **demo-tesla-model3**: ✓ run stored; ✓ both registry lookups ran; ✓ forensic analyst ran iff documents flagged; ✓ every flagged document explained; ✓ explanations cite only raised indicators; ✓ every draft cites findings; ✓ no verdict words; ✓ tool calls ≤ 8; ✓ finished in < 150 s
- **demo-kia-ev6**: ✓ run stored; ✓ both registry lookups ran; ✓ forensic analyst ran iff documents flagged; ✓ every flagged document explained; ✓ explanations cite only raised indicators; ✓ every draft cites findings; ✓ no verdict words; ✓ tool calls ≤ 8; ✓ finished in < 150 s
