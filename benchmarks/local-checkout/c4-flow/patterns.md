# Patterns

- **Document the flow, not the internals.** `006` owns the operator steps and command semantics; `005` lists only what the panel shows; `007` owns the reload boundary. A new capability gets a section in the document whose reader acts on it.
- **Quote the implementation, not the plan.** Every output line, flag and exit code in the docs was checked against `scripts/dsh-superagent` and the tests that pin it; a mismatch (intentional-stop wording) is fixed in the docs, never by editing the script.
- **Two deployment forms, one shared primitive.** `prepare` merges and builds for both a script-managed dedicated profile and a host profile; only the restart differs. Say who owns the process and warn against pointing `restart`/`activate` at a host profile.
- **Pin sentences, not layout.** `tests/docs.spec.ts` asserts standalone semantic sentences through `prose()`; assertions survive rewording around them and fail when meaning drifts.
- **Report on action or failure.** A scheduled check that both skips and succeeds with exit 0 must read the printed marker line; the prompt names the skip lines and the success line instead of relying on the exit code alone.
