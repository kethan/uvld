# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | yes |
| 0.0.1 | no — upgrade immediately |

## Reporting a vulnerability

Please open a private report via GitHub Security Advisories on
[kethan/uvld](https://github.com/kethan/uvld/security/advisories/new), or open an
issue without exploit details and ask for a private channel. Please include a
minimal reproducer and the affected version.

## Design notes

- `uvld` has **zero runtime dependencies** and performs no I/O, no network
  access and no dynamic code evaluation.
- Validation is synchronous and bounded by a depth guard (64 levels), so
  circular input cannot overflow the stack.
- `safeParse` and `is` convert exceptions from user-supplied validators into
  issues; they never throw on bad data.
- Issues contain a **type tag** in `received`, never the raw value, so secrets
  are not copied into error objects/logs.
- Schemas are code you write yourself: never build a schema or a `custom`
  predicate from untrusted input.
