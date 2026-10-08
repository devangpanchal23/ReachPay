# Route metadata smoke command parsing failure

- **Symptoms:** A one-off Node HTTP smoke command exited with `SyntaxError: Invalid regular expression flags` before requesting pages.
- **Root cause:** Over-escaped the closing slash in a JavaScript regex embedded in a shell command.
- **Affected files:** None; app and build were unaffected.
- **Solution:** Replaced regex extraction with the simpler `<title>([^<]+)` expression and reran; all six generated HTML route checks returned 200 with route-specific titles.
- **Tests:** Confirmed `/`, `/about`, `/solutions/payments`, `/contact`, `/privacy` and `/terms` generated page files.
- **Regression risk:** None to application code.
