import { dayLabels } from "./setup-readiness-model.js";
import type { HoursDraft } from "./setup-readiness-model.js";

export function SetupHoursEditor({
  hours,
  onChange,
  id = "hours-editor",
}: {
  readonly hours: readonly HoursDraft[];
  readonly onChange: (index: number, patch: Partial<HoursDraft>) => void;
  readonly id?: string;
}) {
  return (
    <div className="hours-editor" id={id}>
      <div className="hours-editor__heading">
        <strong>Weekly opening hours</strong>
        <span>
          Leave closed days unticked. A closing time earlier than opening means
          the branch closes after midnight.
        </span>
      </div>
      {hours.map((day, index) => (
        <div className="hours-row" key={dayLabels[index]}>
          <label className="hours-row__day">
            <input
              type="checkbox"
              checked={day.enabled}
              onChange={(event) =>
                onChange(index, { enabled: event.target.checked })
              }
            />
            <span>{dayLabels[index]}</span>
          </label>
          <div className="hours-row__periods">
            {day.periods.map((period, periodIndex) => (
              <div
                className="hours-period-row"
                key={`${dayLabels[index]}-${periodIndex}`}
              >
                <label>
                  Opens
                  <input
                    aria-label={`${dayLabels[index]} period ${periodIndex + 1} opens`}
                    type="time"
                    value={period.opensAt}
                    disabled={!day.enabled}
                    onChange={(event) =>
                      onChange(index, {
                        periods: day.periods.map((current, currentIndex) =>
                          currentIndex === periodIndex
                            ? { ...current, opensAt: event.target.value }
                            : current,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Closes
                  <input
                    aria-label={`${dayLabels[index]} period ${periodIndex + 1} closes`}
                    type="time"
                    value={period.closesAt}
                    disabled={!day.enabled}
                    onChange={(event) =>
                      onChange(index, {
                        periods: day.periods.map((current, currentIndex) =>
                          currentIndex === periodIndex
                            ? { ...current, closesAt: event.target.value }
                            : current,
                        ),
                      })
                    }
                  />
                </label>
                {day.periods.length > 1 ? (
                  <button
                    type="button"
                    className="subtle-action"
                    disabled={!day.enabled}
                    onClick={() =>
                      onChange(index, {
                        periods: day.periods.filter(
                          (_, currentIndex) => currentIndex !== periodIndex,
                        ),
                      })
                    }
                  >
                    Remove period
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="subtle-action"
              disabled={!day.enabled}
              onClick={() =>
                onChange(index, {
                  periods: [
                    ...day.periods,
                    { opensAt: "09:00", closesAt: "22:00" },
                  ],
                })
              }
            >
              Add period
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
