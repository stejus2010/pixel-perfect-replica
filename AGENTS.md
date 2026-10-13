<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Screening thresholds, comparison direction and referral rule live only in `src/mc/thresholds.ts`; UI, report and demo all call `evaluateScreening` so outcomes stay deterministic and consistent.
- Demo profiles supply feature values (not scores) so they pass through the real scoring pipeline.
- Normal-score comparison content and rows live in `src/mc/interpretation.ts` and are shared by results and PDF; fictional demo normal scores pass through `assessResults` from control-profile features, remain separate from validated reference datasets, and never affect screening decisions.
