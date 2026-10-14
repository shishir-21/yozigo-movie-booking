# Accessibility smoke checklist

Run the application locally or start the full-stack demo:

```powershell
docker compose -f docker-compose.full.yml up --build -d
```

Open `http://localhost:8080`. Use a fresh browser session and test with the keyboard only.

## Keyboard navigation

- [ ] Press Tab from the top of the page. The **Skip to movie catalogue** link appears with a visible focus outline.
- [ ] Press Enter on the skip link. Focus/navigation reaches the movie catalogue section.
- [ ] Tab through the navigation, catalogue search, language filter, sort control, and movie actions. Every focused control has a clearly visible outline.
- [ ] Open Sign in and Create account. Reach all fields, submit buttons, and close/switch controls without a mouse.
- [ ] Open a movie's showtime picker, choose a show, and navigate the seat map. Available seats can be reached and activated using the keyboard; unavailable seats remain disabled.
- [ ] Complete the simulated checkout and verify the confirmation and follow-up actions are keyboard reachable.
- [ ] Open My bookings and Account. Navigate filters, cancellation actions, form fields, and buttons using Tab, Shift+Tab, Enter, and Space.
- [ ] If using an administrator account, repeat the check in Admin management, show reports, and analytics.

## Motion and contrast preferences

- [ ] In operating-system accessibility settings or browser emulation, enable **Reduce motion**. Reload the page and verify navigation does not smoothly scroll and decorative transitions/animations are suppressed.
- [ ] If available, enable forced-colors/high-contrast mode. Verify focused controls and the skip link remain visible.
- [ ] At a narrow viewport, confirm the focus outline is not clipped and the page remains usable.

## Automated checks

```powershell
npm run lint
npm test
npm run build
```

Then run the full-stack regression suites as documented in the README. These checks do not replace the manual keyboard walkthrough or certify conformance to a specific WCAG level.

Stop the demo when finished:

```powershell
docker compose -f docker-compose.full.yml down
```

Payment stays simulated. Do not enter real card details.
