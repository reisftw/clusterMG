import { getMonthContext } from "./tecIndividualUtils";

describe("TecIndividual", () => {
  it("usa dias uteis a partir do ultimo dia com dados no mes atual", () => {
    const contexto = getMonthContext("Maio", {
      year: 2026,
      now: new Date(2026, 4, 13),
      lastDayWithData: 11,
      feriadosSet: new Set(),
    });

    expect(contexto).toMatchObject({
      isCurrentMonth: true,
      isPastMonth: false,
      isFutureMonth: false,
      daysRemaining: 14,
    });
  });
});

