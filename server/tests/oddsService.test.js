import { computeArbitrageForEvent, americanToDecimal } from '../oddsService.js';

describe('Odds Service Logic', () => {

    describe('americanToDecimal', () => {
        test('converts positive american odds correctly', () => {
            // +150 => 1 + (150/100) = 2.50
            expect(americanToDecimal(150)).toBeCloseTo(2.50, 2);
        });

        test('converts negative american odds correctly', () => {
            // -200 => 1 + (100/200) = 1.50
            expect(americanToDecimal(-200)).toBeCloseTo(1.50, 2);
        });

        test('handles invalid inputs', () => {
            expect(americanToDecimal('invalid')).toBeNull();
        });
    });

    describe('computeArbitrageForEvent', () => {
        const mockEvent = {
            id: 'evt_123',
            sport_key: 'test_sport',
            home_team: 'Team A',
            away_team: 'Team B',
            commence_time: '2025-01-01T12:00:00Z',
            bookmakers: [
                {
                    key: 'bookie_1',
                    markets: [{
                        key: 'h2h',
                        outcomes: [
                            { name: 'Team A', price: 150 }, // 2.50
                            { name: 'Team B', price: -180 } // 1.55
                        ]
                    }]
                },
                {
                    key: 'bookie_2',
                    markets: [{
                        key: 'h2h',
                        outcomes: [
                            { name: 'Team A', price: 120 }, // 2.20
                            { name: 'Team B', price: 110 }  // 2.10  <-- ARB! (1/2.50 + 1/2.10 = 0.4 + 0.476 = 0.876 < 1)
                        ]
                    }]
                }
            ]
        };

        test('identifies profitable arbitrage opportunity', () => {
            // We construct a scenario where:
            // Bookie 1: Team A (+150 => 2.50)
            // Bookie 2: Team B (+110 => 2.10)
            // Implied Prob: 1/2.5 + 1/2.1 = 0.4 + 0.476 = 0.876 (87.6%)
            // Profit Margin should be positive.

            const result = computeArbitrageForEvent(mockEvent, { bankroll: 100 });

            expect(result).not.toBeNull();
            expect(result.id).toBe('evt_123');
            expect(result.edge_percent).toBeGreaterThan(0);

            // Check specific outcomes picked
            const teamA = result.outcomes.find(o => o.name === 'Team A');
            const teamB = result.outcomes.find(o => o.name === 'Team B');

            expect(teamA.priceAmerican).toBe(150); // From Bookie 1
            expect(teamB.priceAmerican).toBe(110); // From Bookie 2
        });

        test('returns null when no arbitrage exists', () => {
            const badEven = {
                ...mockEvent,
                bookmakers: [{
                    key: 'bookie_bad',
                    markets: [{
                        key: 'h2h',
                        outcomes: [ // Vigorish > 0
                            { name: 'Team A', price: -110 }, // 1.91
                            { name: 'Team B', price: -110 }  // 1.91
                        ]
                    }]
                }]
            };
            // 1/1.91 + 1/1.91 > 1
            const result = computeArbitrageForEvent(badEven);
            expect(result).toBeNull();
        });

        test('handles missing markets gracefully', () => {
            const emptyEvent = { ...mockEvent, bookmakers: [] };
            const result = computeArbitrageForEvent(emptyEvent);
            expect(result).toBeNull();
        });
    });
});
