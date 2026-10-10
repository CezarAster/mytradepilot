"""Generates public/sample-trades.csv: a fictional trader's fills (not real trades),
with patterns the analyzer should find: strong first 15 min, weak late trades,
quick re-entries after losses that lose money, losers held overnight.
Losers run well past a 2% stop; a few winners dip past it and come back."""
import csv, random
from datetime import date, datetime, timedelta

random.seed(7)
exc = random.Random(11)
TICKERS = ['NOVA', 'QBIT', 'RKT', 'HYDR', 'LUMN', 'ORBX']
rows = []
day = date(2026, 3, 2)
for _ in range(45):
    while day.weekday() >= 5:
        day += timedelta(days=1)
    t = datetime(day.year, day.month, day.day, 9, 31 + random.randint(0, 12))
    prev_loss = False
    for k in range(random.choice([1, 2, 2, 3, 3, 4, 5])):
        sym = random.choice(TICKERS)
        side = 1 if random.random() < 0.6 else -1
        price = round(random.uniform(8, 60), 2)
        early = t.hour == 9 and t.minute < 45
        quick = prev_loss
        mu = 1.4 if early else (-0.9 if quick else (-0.2 if k >= 3 else 0.35))
        ret = random.gauss(mu, 2.0)
        hold = random.randint(10, 150)
        overnight = ret < -1.5 and random.random() < 0.4
        if overnight:
            ret -= random.uniform(1, 3)
        exit_t = t + timedelta(minutes=hold) if not overnight else t + timedelta(days=1, minutes=-30)
        qty = int(10000 / price)
        exit_price = round(price * (1 + side * ret / 100), 2)
        if ret > 0:
            worst = -abs(exc.gauss(0.7, 0.5)) if exc.random() > 0.12 else -abs(exc.gauss(2.4, 0.4))
            best = ret + abs(exc.gauss(0.4, 0.4))
        else:
            worst = ret - abs(exc.gauss(0.6, 0.5))
            best = abs(exc.gauss(0.3, 0.35)) if exc.random() < 0.6 else 0.0
        worst = min(worst, 0.0)
        rows.append([sym, 'Buy' if side > 0 else 'Sell short', qty, price, t.strftime('%Y-%m-%d %H:%M:%S'), 1.0, '', ''])
        rows.append([sym, 'Sell' if side > 0 else 'Buy to cover', qty, exit_price, exit_t.strftime('%Y-%m-%d %H:%M:%S'), 1.0, f'{worst:.2f}', f'{best:.2f}'])
        prev_loss = ret < 0
        gap = random.randint(3, 8) if prev_loss and random.random() < 0.6 else random.randint(15, 70)
        t = (exit_t if not overnight else t) + timedelta(minutes=gap)
        if t.hour >= 15:
            break
    day += timedelta(days=1)

rows.sort(key=lambda r: r[4])
with open('public/sample-trades.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Symbol', 'Side', 'Qty', 'Price', 'Time', 'Commission', 'Worst %', 'Best %'])
    w.writerows(rows)
print(len(rows), 'fills')
