# Day Plan — success metrics baseline

Capture **2 weeks before release** for comparison **4 weeks after** Phase 1 MVP.

## Adoption

| Metric | How to measure |
|--------|----------------|
| Widget DAU | Log or analytics on `GET /work/day-plan` and dashboard widget render |
| LEAD table usage | Sessions with sort/filter on `dayPlanPercent` column |

## Outcome (SQL sketches)

**Average team day-plan % (last 14 days)** — requires historical snapshots (Phase 2).  
Until snapshots exist, use **on-demand replay**: call `DayPlanService.getOverallPercentsForUsers` for each Kyiv day in range.

**Raw activity baseline** (available now via dashboard):

```sql
-- Outbound calls per manager per Kyiv day (adjust timezone in app layer)
SELECT manager_user_id, date_trunc('day', started_at) AS d, count(*)
FROM "Call"
WHERE upper(direction) = 'OUTBOUND'
  AND started_at >= now() - interval '14 days'
GROUP BY 1, 2;
```

**Tasks due today completion** — compare `Task` with `dueAt` in day vs `status=DONE`.

## Success criteria (Phase 1, +4 weeks)

- ≥70% managers open day-plan widget ≥3×/week
- Team average `dayPlanPercent` stable or up vs 2-week pre-release baseline
- LEAD uses team % column ≥2×/week

## Pre-release checklist

1. Export `daily-team-activity` rows for last 14 Kyiv days (calls, visits, orders per user).
2. Note current avg outbound calls / manager / day.
3. Note % managers with any overdue tasks EOD.
4. Store in internal sheet; compare after 4 weeks.
