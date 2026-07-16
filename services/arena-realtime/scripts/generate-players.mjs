// One-off generator for /data/nba_players.json. Run with:
//   node services/arena-realtime/scripts/generate-players.mjs
// Produces the same file content in both services/arena-realtime/src/data/
// and apps/web/src/data/ (each service owns its own copy; no shared package).
//
// Data is best-effort from training knowledge, not scraped/verified against
// a live stats source — acceptable for gameplay purposes per project scope,
// not a source of record. Fields match the schema in the implementation plan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Compact tuple form to keep 500+ entries manageable:
// [name, pos, draftYear, round, pick, country, ppg, apg, rpg, startYr, endYr, teams[], allStar, champs, hof, heightIn, archetype]
const RAW = [
  // ---- 1950s-60s pioneers ----
  ["Bill Russell", "C", 1956, 1, 2, "USA", 15.1, 4.3, 22.5, 1956, 1969, ["BOS"], 12, 11, true, 82, "big-defender"],
  ["Wilt Chamberlain", "C", 1959, 1, 1, "USA", 30.1, 4.4, 22.9, 1959, 1973, ["PHW", "SFW", "PHI", "LAL"], 13, 2, true, 85, "big-scorer"],
  ["Bob Cousy", "PG", 1950, 1, 3, "USA", 18.4, 7.5, 5.2, 1950, 1970, ["BOS"], 13, 6, true, 73, "guard-scorer"],
  ["Jerry West", "SG", 1960, 1, 2, "USA", 27.0, 6.7, 5.8, 1960, 1974, ["LAL"], 14, 1, true, 75, "guard-scorer"],
  ["Oscar Robertson", "PG", 1960, 1, 1, "USA", 25.7, 9.5, 7.5, 1960, 1974, ["CIN", "MIL"], 12, 1, true, 76, "guard-scorer"],
  ["Elgin Baylor", "SF", 1958, 1, 1, "USA", 27.4, 4.3, 13.5, 1958, 1972, ["MNL", "LAL"], 11, 0, true, 79, "wing-scorer"],
  ["George Mikan", "C", 1948, 1, 1, "USA", 23.1, 2.8, 13.4, 1948, 1956, ["MNL"], 4, 5, true, 82, "big-scorer"],
  ["Elvin Hayes", "PF", 1968, 1, 1, "USA", 21.0, 2.0, 12.5, 1968, 1984, ["SDR", "HOU", "CAP", "WSB"], 12, 1, true, 81, "big-scorer"],
  ["Willis Reed", "C", 1964, 2, 8, "USA", 18.7, 1.8, 12.9, 1964, 1974, ["NYK"], 7, 2, true, 82, "big-scorer"],
  ["Nate Thurmond", "C", 1963, 1, 3, "USA", 15.0, 2.7, 15.0, 1963, 1977, ["SFW", "CHI", "CLE"], 7, 0, true, 83, "big-defender"],

  // ---- 1970s ----
  ["Kareem Abdul-Jabbar", "C", 1969, 1, 1, "USA", 24.6, 3.6, 11.2, 1969, 1989, ["MIL", "LAL"], 19, 6, true, 86, "big-scorer"],
  ["Julius Erving", "SF", 1971, 1, 12, "USA", 22.0, 3.9, 6.7, 1971, 1987, ["VIR", "PHI"], 16, 1, true, 80, "wing-scorer"],
  ["Walt Frazier", "PG", 1967, 1, 5, "USA", 18.9, 6.1, 5.9, 1967, 1980, ["NYK", "CLE"], 7, 2, true, 75, "guard-defender"],
  ["Rick Barry", "SF", 1965, 1, 2, "USA", 23.2, 4.9, 6.5, 1965, 1980, ["SFW", "OAK", "NYA", "GSW", "HOU"], 12, 1, true, 79, "wing-scorer"],
  ["Pete Maravich", "SG", 1970, 1, 3, "USA", 24.2, 5.4, 4.2, 1970, 1980, ["ATL", "NOJ", "UTA", "BOS"], 5, 0, true, 77, "guard-scorer"],
  ["Bob McAdoo", "PF", 1972, 1, 2, "USA", 22.1, 2.3, 9.4, 1972, 1986, ["BUF", "NYK", "BOS", "DET", "LAL", "PHI"], 5, 2, true, 81, "big-scorer"],
  ["Dave Cowens", "C", 1970, 1, 4, "USA", 17.6, 3.8, 13.6, 1970, 1983, ["BOS", "MIL"], 8, 2, true, 81, "big-defender"],
  ["Wes Unseld", "C", 1968, 1, 2, "USA", 10.8, 3.9, 14.0, 1968, 1981, ["BAL", "CAP", "WSB"], 5, 1, true, 81, "big-defender"],
  ["Moses Malone", "C", 1974, 0, 0, "USA", 20.6, 1.4, 12.2, 1974, 1995, ["UTA", "STL", "BUF", "HOU", "PHI", "WSB", "ATL", "MIL", "SAS"], 13, 1, true, 82, "big-scorer"],
  ["George Gervin", "SG", 1974, 0, 0, "USA", 25.1, 2.6, 5.3, 1974, 1986, ["VIR", "SAS", "CHI"], 12, 0, true, 79, "guard-scorer"],
  ["Artis Gilmore", "C", 1971, 1, 1, "USA", 17.1, 2.3, 10.1, 1971, 1988, ["KTC", "CHI", "SAS", "BOS"], 6, 1, true, 85, "big-scorer"],

  // ---- 1980s ----
  ["Magic Johnson", "PG", 1979, 1, 1, "USA", 19.5, 11.2, 7.2, 1979, 1996, ["LAL"], 12, 5, true, 81, "guard-scorer"],
  ["Larry Bird", "SF", 1978, 1, 6, "USA", 24.3, 6.3, 10.0, 1979, 1992, ["BOS"], 12, 3, true, 81, "wing-scorer"],
  ["Isiah Thomas", "PG", 1981, 1, 2, "USA", 19.2, 9.3, 3.6, 1981, 1994, ["DET"], 12, 2, true, 73, "guard-scorer"],
  ["Hakeem Olajuwon", "C", 1984, 1, 1, "Nigeria", 21.8, 2.5, 11.1, 1984, 2002, ["HOU", "TOR"], 12, 2, true, 84, "big-defender"],
  ["Patrick Ewing", "C", 1985, 1, 1, "Jamaica", 21.0, 1.9, 9.8, 1985, 2002, ["NYK", "SEA", "ORL"], 11, 0, true, 84, "big-scorer"],
  ["Charles Barkley", "PF", 1984, 1, 5, "USA", 22.1, 3.9, 11.7, 1984, 2000, ["PHI", "PHX", "HOU"], 11, 0, true, 78, "big-scorer"],
  ["Karl Malone", "PF", 1985, 1, 13, "USA", 25.0, 3.6, 10.1, 1985, 2004, ["UTA", "LAL"], 14, 0, true, 81, "big-scorer"],
  ["John Stockton", "PG", 1984, 1, 16, "USA", 13.1, 10.5, 2.7, 1984, 2003, ["UTA"], 10, 0, true, 74, "guard-defender"],
  ["Clyde Drexler", "SG", 1983, 1, 14, "USA", 20.4, 5.6, 6.1, 1983, 1998, ["POR", "HOU"], 10, 1, true, 79, "wing-scorer"],
  ["Dominique Wilkins", "SF", 1982, 1, 3, "USA", 24.8, 2.5, 6.7, 1982, 1999, ["ATL", "LAC", "BOS", "SAS", "ORL"], 9, 0, true, 80, "wing-scorer"],
  ["James Worthy", "SF", 1982, 1, 1, "USA", 17.6, 3.0, 5.1, 1982, 1994, ["LAL"], 7, 3, true, 81, "wing-scorer"],
  ["Alex English", "SF", 1976, 2, 23, "USA", 21.5, 3.6, 5.5, 1976, 1991, ["MIL", "IND", "DEN", "DAL"], 8, 0, true, 79, "wing-scorer"],
  ["Robert Parish", "C", 1976, 1, 8, "USA", 14.5, 1.5, 9.1, 1976, 1997, ["GSW", "BOS", "CHH", "CHI"], 9, 4, true, 83, "big-defender"],
  ["Kevin McHale", "PF", 1980, 1, 3, "USA", 17.9, 1.7, 7.3, 1980, 1993, ["BOS"], 7, 3, true, 82, "big-scorer"],
  ["Dennis Johnson", "PG", 1976, 2, 29, "USA", 14.1, 5.0, 3.9, 1976, 1990, ["SEA", "PHX", "BOS"], 5, 3, true, 77, "guard-defender"],
  ["Bernard King", "SF", 1977, 1, 7, "USA", 22.5, 2.5, 5.8, 1977, 1993, ["NJN", "UTA", "GSW", "NYK", "WSB"], 4, 0, true, 79, "wing-scorer"],
  ["Adrian Dantley", "SF", 1976, 1, 6, "USA", 24.3, 2.6, 5.7, 1976, 1991, ["BUF", "IND", "LAL", "UTA", "DET", "DAL", "MIL"], 6, 0, true, 78, "wing-scorer"],
  ["Sidney Moncrief", "SG", 1979, 1, 5, "USA", 15.6, 3.6, 4.0, 1979, 1991, ["MIL", "ATL"], 5, 0, true, 76, "guard-defender"],
  ["Buck Williams", "PF", 1981, 1, 3, "USA", 12.8, 1.7, 10.0, 1981, 1998, ["NJN", "POR", "NYK"], 3, 0, false, 80, "big-defender"],
  ["Maurice Cheeks", "PG", 1978, 2, 36, "USA", 11.1, 6.7, 3.0, 1978, 1993, ["PHI", "SAS", "NYK", "ATL", "NJN"], 4, 1, true, 74, "guard-defender"],
  ["Dan Issel", "C", 1970, 0, 0, "USA", 22.6, 2.4, 9.1, 1970, 1985, ["KTC", "DEN"], 6, 0, true, 81, "big-scorer"],
];

const NINETIES = [
  ["Michael Jordan", "SG", 1984, 1, 3, "USA", 30.1, 5.3, 6.2, 1984, 2003, ["CHI", "WAS"], 14, 6, true, 78, "guard-scorer"],
  ["Scottie Pippen", "SF", 1987, 1, 5, "USA", 16.1, 5.2, 6.4, 1987, 2004, ["CHI", "HOU", "POR"], 7, 6, true, 80, "wing-defender"],
  ["Shaquille O'Neal", "C", 1992, 1, 1, "USA", 23.7, 2.5, 10.9, 1992, 2011, ["ORL", "LAL", "MIA", "PHX", "CLE", "BOS"], 15, 4, true, 85, "big-scorer"],
  ["Reggie Miller", "SG", 1987, 1, 11, "USA", 18.2, 3.0, 3.0, 1987, 2005, ["IND"], 5, 0, true, 79, "guard-scorer"],
  ["Gary Payton", "PG", 1990, 1, 2, "USA", 16.3, 6.7, 3.9, 1990, 2007, ["SEA", "MIL", "LAL", "BOS", "MIA"], 9, 1, true, 76, "guard-defender"],
  ["David Robinson", "C", 1987, 1, 1, "USA", 21.1, 2.5, 10.6, 1989, 2003, ["SAS"], 10, 2, true, 85, "big-defender"],
  ["Grant Hill", "SF", 1994, 1, 3, "USA", 16.7, 4.1, 6.0, 1994, 2013, ["DET", "ORL", "PHX", "LAC"], 7, 0, true, 80, "wing-scorer"],
  ["Allen Iverson", "PG", 1996, 1, 1, "USA", 26.7, 6.2, 3.7, 1996, 2010, ["PHI", "DEN", "DET", "MEM"], 11, 0, true, 72, "guard-scorer"],
  ["Kobe Bryant", "SG", 1996, 1, 13, "USA", 25.0, 4.7, 5.2, 1996, 2016, ["LAL"], 18, 5, true, 78, "guard-scorer"],
  ["Ray Allen", "SG", 1996, 1, 5, "USA", 18.9, 3.4, 4.1, 1996, 2014, ["MIL", "SEA", "BOS", "MIA"], 10, 2, true, 77, "guard-scorer"],
  ["Steve Nash", "PG", 1996, 1, 15, "Canada", 14.3, 8.5, 3.0, 1996, 2015, ["PHX", "DAL", "LAL"], 8, 0, true, 75, "guard-scorer"],
  ["Jason Kidd", "PG", 1994, 1, 2, "USA", 12.6, 8.7, 6.3, 1994, 2013, ["DAL", "PHX", "NJN", "NYK"], 10, 1, true, 76, "guard-defender"],
  ["Chris Webber", "PF", 1993, 1, 1, "USA", 20.7, 4.2, 9.8, 1993, 2008, ["GSW", "WSB", "SAC", "PHI", "DET"], 5, 0, true, 82, "big-scorer"],
  ["Vlade Divac", "C", 1989, 1, 26, "Serbia", 11.8, 3.1, 8.2, 1989, 2005, ["LAL", "CHH", "SAC"], 1, 0, true, 83, "big-defender"],
  ["Dikembe Mutombo", "C", 1991, 1, 4, "DR Congo", 9.8, 1.0, 10.3, 1991, 2009, ["DEN", "ATL", "PHI", "NJN", "NYK", "HOU"], 8, 0, true, 85, "big-defender"],
  ["Mitch Richmond", "SG", 1988, 1, 5, "USA", 21.0, 3.5, 3.9, 1988, 2002, ["GSW", "SAC", "WAS"], 6, 1, true, 76, "guard-scorer"],
  ["Glen Rice", "SF", 1989, 1, 4, "USA", 18.3, 2.0, 4.2, 1989, 2004, ["MIA", "CHH", "LAL", "NYK", "HOU", "LAC"], 3, 1, false, 80, "wing-scorer"],
  ["Alonzo Mourning", "C", 1992, 1, 2, "USA", 17.1, 1.1, 8.5, 1992, 2008, ["CHH", "MIA", "NJN"], 7, 1, true, 82, "big-defender"],
  ["Tim Hardaway", "PG", 1989, 1, 14, "USA", 17.7, 8.2, 3.3, 1989, 2003, ["GSW", "MIA", "DAL", "DEN", "IND"], 5, 0, true, 72, "guard-scorer"],
  ["Latrell Sprewell", "SG", 1992, 1, 24, "USA", 18.3, 3.4, 4.0, 1992, 2005, ["GSW", "NYK", "MIN"], 4, 0, false, 77, "guard-scorer"],
  ["Chris Mullin", "SF", 1985, 1, 7, "USA", 18.2, 3.5, 3.9, 1985, 2001, ["GSW", "IND"], 5, 0, true, 79, "wing-scorer"],
  ["Dennis Rodman", "PF", 1986, 2, 27, "USA", 7.3, 1.8, 13.1, 1986, 2000, ["DET", "SAS", "CHI", "LAL", "DAL"], 2, 5, true, 79, "big-defender"],
  ["Detlef Schrempf", "SF", 1985, 1, 8, "Germany", 13.9, 4.4, 6.1, 1985, 2001, ["DAL", "IND", "SEA", "POR"], 3, 0, false, 82, "wing-scorer"],
];
RAW.push(...NINETIES);

const TWO_THOUSANDS = [
  ["Dirk Nowitzki", "PF", 1998, 1, 9, "Germany", 20.7, 2.4, 7.5, 1998, 2019, ["DAL"], 14, 1, true, 84, "big-scorer"],
  ["Tim Duncan", "PF", 1997, 1, 1, "U.S. Virgin Islands", 19.0, 3.0, 10.8, 1997, 2016, ["SAS"], 15, 5, true, 83, "big-defender"],
  ["Kevin Garnett", "PF", 1995, 1, 5, "USA", 17.8, 3.7, 10.0, 1995, 2016, ["MIN", "BOS", "BKN"], 15, 1, true, 83, "big-defender"],
];
RAW.push(...TWO_THOUSANDS);

const MORE2000S = [
  ["Dwyane Wade", "SG", 2003, 1, 5, "USA", 22.0, 5.4, 4.7, 2003, 2019, ["MIA", "CHI", "CLE"], 13, 3, true, 76, "guard-scorer"],
  ["Carmelo Anthony", "SF", 2003, 1, 3, "USA", 22.5, 2.7, 6.2, 2003, 2022, ["DEN", "NYK", "OKC", "HOU", "POR", "LAL"], 10, 0, false, 80, "wing-scorer"],
  ["Chris Bosh", "PF", 2003, 1, 4, "USA", 19.2, 2.2, 8.5, 2003, 2017, ["TOR", "MIA"], 11, 2, true, 83, "big-scorer"],
  ["Tony Parker", "PG", 2001, 1, 28, "France", 15.5, 5.6, 2.7, 2001, 2019, ["SAS", "CHH"], 6, 4, true, 74, "guard-scorer"],
  ["Manu Ginobili", "SG", 1999, 2, 57, "Argentina", 13.3, 3.8, 3.5, 2002, 2018, ["SAS"], 2, 4, true, 78, "guard-scorer"],
  ["Pau Gasol", "PF", 2001, 1, 3, "Spain", 17.0, 3.2, 8.7, 2001, 2019, ["MEM", "LAL", "CHI", "SAS", "MIL"], 6, 2, true, 84, "big-scorer"],
  ["Yao Ming", "C", 2002, 1, 1, "China", 19.0, 1.6, 9.2, 2002, 2011, ["HOU"], 8, 0, true, 90, "big-scorer"],
  ["Tracy McGrady", "SG", 1997, 1, 9, "USA", 19.6, 4.4, 5.6, 1997, 2013, ["TOR", "ORL", "HOU", "NYK", "ATL", "SAS"], 7, 0, true, 79, "wing-scorer"],
  ["Vince Carter", "SG", 1998, 1, 5, "USA", 16.7, 3.1, 4.3, 1998, 2020, ["TOR", "NJN", "ORL", "PHX", "DAL", "MEM", "SAC", "ATL"], 8, 0, true, 78, "wing-scorer"],
  ["Baron Davis", "PG", 1999, 1, 3, "USA", 16.1, 7.2, 4.1, 1999, 2012, ["CHH", "GSW", "LAC", "NYK", "NOH"], 2, 0, false, 75, "guard-scorer"],
  ["Elton Brand", "PF", 1999, 1, 1, "USA", 15.6, 2.4, 8.3, 1999, 2015, ["CHI", "LAC", "PHI", "DAL", "ATL"], 2, 0, false, 81, "big-scorer"],
  ["Jermaine O'Neal", "C", 1996, 1, 17, "USA", 12.9, 1.4, 7.1, 1996, 2014, ["POR", "IND", "TOR", "MIA", "PHX", "GSW"], 6, 0, false, 83, "big-scorer"],
  ["Ben Wallace", "C", 1996, 0, 0, "USA", 5.7, 1.3, 9.6, 1996, 2012, ["WSB", "ORL", "DET", "CHI", "CLE"], 4, 1, true, 81, "big-defender"],
  ["Chauncey Billups", "PG", 1997, 1, 3, "USA", 15.2, 5.4, 3.0, 1997, 2014, ["BOS", "TOR", "DEN", "MIN", "DET", "NYK", "LAC"], 5, 1, true, 75, "guard-scorer"],
  ["Richard Hamilton", "SG", 1999, 1, 7, "USA", 17.4, 3.3, 3.1, 1999, 2013, ["WSB", "DET", "CHI"], 3, 1, false, 78, "guard-scorer"],
  ["Rasheed Wallace", "PF", 1995, 1, 4, "USA", 14.4, 1.9, 6.7, 1995, 2013, ["WSB", "POR", "ATL", "DET", "BOS", "NYK"], 4, 1, false, 82, "big-scorer"],
  ["Antawn Jamison", "PF", 1998, 1, 4, "USA", 18.2, 1.9, 7.6, 1998, 2014, ["GSW", "DAL", "WAS", "CLE", "LAL"], 2, 0, false, 79, "big-scorer"],
  ["Gilbert Arenas", "PG", 2001, 2, 31, "USA", 20.7, 5.3, 3.9, 2001, 2012, ["GSW", "WAS", "ORL", "MEM"], 3, 0, false, 75, "guard-scorer"],
  ["Paul Pierce", "SF", 1998, 1, 10, "USA", 19.7, 3.5, 5.6, 1998, 2017, ["BOS", "BKN", "WAS", "LAC"], 10, 1, true, 79, "wing-scorer"],
  ["Amare Stoudemire", "PF", 2002, 1, 9, "USA", 18.9, 1.0, 7.8, 2002, 2016, ["PHX", "NYK", "DAL", "MIA"], 6, 0, false, 82, "big-scorer"],
  ["Andrei Kirilenko", "SF", 1999, 1, 24, "Russia", 12.0, 2.8, 5.5, 2001, 2015, ["UTA", "MIN", "BKN"], 1, 0, false, 81, "wing-defender"],
];
RAW.push(...MORE2000S);

const TWENTY_TENS = [
  ["LeBron James", "SF", 2003, 1, 1, "USA", 27.1, 7.4, 7.5, 2003, 2025, ["CLE", "MIA", "LAL"], 20, 4, false, 81, "wing-scorer"],
  ["Kevin Durant", "SF", 2007, 1, 2, "USA", 27.3, 4.3, 7.0, 2007, 2025, ["OKC", "GSW", "BKN", "PHX", "HOU"], 14, 2, false, 82, "wing-scorer"],
  ["Stephen Curry", "PG", 2009, 1, 7, "USA", 24.6, 6.4, 4.7, 2009, 2025, ["GSW"], 10, 4, false, 75, "guard-scorer"],
  ["Chris Paul", "PG", 2005, 1, 4, "USA", 17.5, 9.2, 4.4, 2005, 2025, ["NOH", "LAC", "HOU", "OKC", "PHX", "GSW", "SAS"], 12, 0, false, 72, "guard-defender"],
  ["Russell Westbrook", "PG", 2008, 1, 4, "USA", 21.5, 8.1, 7.3, 2008, 2025, ["OKC", "HOU", "WAS", "LAL", "LAC", "DEN"], 9, 0, false, 75, "guard-scorer"],
  ["James Harden", "SG", 2009, 1, 3, "USA", 24.9, 7.0, 5.4, 2009, 2025, ["OKC", "HOU", "BKN", "PHI", "LAC"], 10, 0, false, 77, "guard-scorer"],
  ["Kawhi Leonard", "SF", 2011, 1, 15, "USA", 20.0, 3.0, 6.2, 2011, 2025, ["SAS", "TOR", "LAC"], 6, 2, false, 79, "wing-defender"],
  ["Damian Lillard", "PG", 2012, 1, 6, "USA", 25.2, 6.7, 4.2, 2012, 2025, ["POR", "MIL"], 7, 0, false, 74, "guard-scorer"],
  ["Giannis Antetokounmpo", "PF", 2013, 1, 15, "Greece", 24.8, 4.9, 10.2, 2013, 2025, ["MIL"], 8, 1, false, 83, "big-scorer"],
  ["Joel Embiid", "C", 2014, 1, 3, "Cameroon", 27.8, 3.4, 11.1, 2016, 2025, ["PHI"], 7, 0, false, 84, "big-scorer"],
  ["Anthony Davis", "PF", 2012, 1, 1, "USA", 24.1, 2.4, 10.4, 2012, 2025, ["NOP", "LAL", "DAL"], 8, 1, false, 82, "big-scorer"],
  ["Klay Thompson", "SG", 2011, 1, 11, "USA", 19.5, 2.3, 3.6, 2011, 2025, ["GSW", "DAL"], 5, 4, false, 79, "guard-scorer"],
  ["Draymond Green", "PF", 2012, 2, 35, "USA", 8.4, 5.6, 7.1, 2012, 2025, ["GSW"], 4, 4, false, 79, "big-defender"],
  ["Kyrie Irving", "PG", 2011, 1, 1, "Australia", 23.4, 5.4, 3.8, 2011, 2025, ["CLE", "BOS", "BKN", "DAL"], 9, 1, false, 74, "guard-scorer"],
  ["DeMar DeRozan", "SG", 2009, 1, 9, "USA", 21.4, 3.9, 4.4, 2009, 2025, ["TOR", "SAS", "CHI", "SAC"], 6, 0, false, 78, "wing-scorer"],
  ["Paul George", "SF", 2010, 1, 10, "USA", 20.1, 3.6, 5.9, 2010, 2025, ["IND", "OKC", "LAC", "PHI"], 9, 0, false, 80, "wing-scorer"],
  ["Jimmy Butler", "SF", 2011, 1, 30, "USA", 18.1, 4.6, 5.3, 2011, 2025, ["CHI", "MIN", "PHI", "MIA", "GSW"], 6, 0, false, 79, "wing-defender"],
  ["Blake Griffin", "PF", 2009, 1, 1, "USA", 19.0, 3.9, 7.3, 2010, 2023, ["LAC", "DET", "BKN", "BOS"], 6, 0, false, 82, "big-scorer"],
  ["DeMarcus Cousins", "C", 2010, 1, 5, "USA", 19.6, 3.5, 10.5, 2010, 2022, ["SAC", "NOP", "GSW", "LAL", "MIL", "DEN"], 4, 0, false, 83, "big-scorer"],
  ["Rudy Gobert", "C", 2013, 1, 27, "France", 11.8, 1.3, 12.4, 2013, 2025, ["UTA", "MIN"], 3, 0, false, 85, "big-defender"],
  ["Andre Drummond", "C", 2012, 1, 9, "USA", 12.9, 1.0, 12.9, 2012, 2025, ["DET", "CLE", "LAL", "PHI", "CHI"], 2, 0, false, 82, "big-defender"],
  ["Ben Simmons", "PG", 2016, 1, 1, "Australia", 12.9, 7.2, 7.5, 2017, 2025, ["PHI", "BKN"], 3, 0, false, 82, "guard-defender"],
  ["Mike Conley", "PG", 2007, 1, 4, "USA", 14.9, 5.4, 3.0, 2007, 2025, ["MEM", "UTA", "MIN"], 1, 0, false, 73, "guard-defender"],
  ["Al Horford", "C", 2007, 1, 3, "Dominican Republic", 12.0, 2.9, 7.5, 2007, 2025, ["ATL", "BOS", "PHI", "OKC"], 5, 1, false, 82, "big-defender"],
  ["Kyle Lowry", "PG", 2006, 1, 24, "USA", 14.1, 6.1, 4.0, 2006, 2024, ["MEM", "HOU", "TOR", "MIA", "PHI"], 6, 1, false, 72, "guard-defender"],
  ["Kemba Walker", "PG", 2011, 1, 9, "USA", 17.6, 5.4, 3.4, 2011, 2023, ["CHA", "BOS", "NYK", "DAL"], 4, 0, false, 72, "guard-scorer"],
  ["Gordon Hayward", "SF", 2010, 1, 9, "USA", 14.5, 3.4, 4.9, 2010, 2024, ["UTA", "BOS", "CHA", "OKC"], 1, 0, false, 80, "wing-scorer"],
  ["Rudy Gay", "SF", 2006, 1, 8, "USA", 16.9, 2.1, 5.5, 2006, 2023, ["MEM", "TOR", "SAC", "SAS", "UTA"], 0, 0, false, 80, "wing-scorer"],
  ["Paul Millsap", "PF", 2006, 2, 47, "USA", 13.9, 2.1, 7.2, 2006, 2021, ["UTA", "ATL", "DEN", "BKN"], 4, 0, false, 80, "big-scorer"],
  ["Markieff Morris", "PF", 2011, 1, 13, "USA", 9.4, 1.5, 4.5, 2011, 2023, ["PHX", "WAS", "OKC", "DET", "MIA", "BKN", "CLE"], 0, 0, false, 82, "big-scorer"],
  ["Tobias Harris", "SF", 2011, 1, 19, "USA", 15.7, 2.2, 5.7, 2011, 2025, ["MIL", "ORL", "DET", "LAC", "PHI", "DET"], 0, 0, false, 80, "wing-scorer"],
  ["Spencer Dinwiddie", "PG", 2014, 2, 38, "USA", 13.6, 4.7, 2.9, 2014, 2025, ["DET", "BKN", "WAS", "DAL", "BKN", "TOR"], 0, 0, false, 77, "guard-scorer"],
];
RAW.push(...TWENTY_TENS);

const RECENT = [
  ["Luka Doncic", "PG", 2018, 1, 3, "Slovenia", 28.6, 8.2, 8.6, 2018, 2025, ["DAL", "LAL"], 5, 0, false, 79, "guard-scorer"],
  ["Trae Young", "PG", 2018, 1, 5, "USA", 25.3, 9.5, 3.5, 2018, 2025, ["ATL"], 3, 0, false, 73, "guard-scorer"],
  ["Ja Morant", "PG", 2019, 1, 2, "USA", 23.0, 7.6, 4.6, 2019, 2025, ["MEM"], 2, 0, false, 75, "guard-scorer"],
  ["Zion Williamson", "PF", 2019, 1, 1, "USA", 22.9, 3.5, 6.9, 2019, 2025, ["NOP"], 2, 0, false, 78, "big-scorer"],
  ["Jayson Tatum", "SF", 2017, 1, 3, "USA", 23.6, 4.2, 7.0, 2017, 2025, ["BOS"], 6, 1, false, 80, "wing-scorer"],
  ["Jaylen Brown", "SG", 2016, 1, 3, "USA", 19.8, 2.9, 5.7, 2016, 2025, ["BOS"], 3, 1, false, 78, "wing-scorer"],
  ["Devin Booker", "SG", 2015, 1, 13, "USA", 24.3, 4.9, 4.2, 2015, 2025, ["PHX"], 4, 0, false, 77, "guard-scorer"],
  ["Donovan Mitchell", "SG", 2017, 1, 13, "USA", 24.5, 4.5, 4.1, 2017, 2025, ["UTA", "CLE"], 5, 0, false, 75, "guard-scorer"],
  ["Shai Gilgeous-Alexander", "SG", 2018, 1, 11, "Canada", 24.6, 5.5, 4.9, 2018, 2025, ["LAC", "OKC"], 4, 0, false, 78, "guard-scorer"],
  ["Anthony Edwards", "SG", 2020, 1, 1, "USA", 23.7, 4.0, 5.3, 2020, 2025, ["MIN"], 3, 0, false, 76, "wing-scorer"],
  ["Bam Adebayo", "C", 2017, 1, 14, "USA", 16.5, 4.0, 9.5, 2017, 2025, ["MIA"], 4, 0, false, 81, "big-defender"],
  ["Domantas Sabonis", "C", 2016, 1, 11, "Lithuania", 16.9, 5.9, 11.4, 2016, 2025, ["OKC", "SAC"], 3, 0, false, 83, "big-scorer"],
  ["Victor Oladipo", "SG", 2013, 1, 2, "USA", 15.9, 3.6, 4.0, 2013, 2023, ["ORL", "OKC", "IND", "HOU", "MIA"], 2, 0, false, 76, "guard-defender"],
  ["Karl-Anthony Towns", "C", 2015, 1, 1, "USA", 22.9, 3.0, 10.8, 2015, 2025, ["MIN", "NYK"], 4, 0, false, 84, "big-scorer"],
  ["Nikola Jokic", "C", 2014, 2, 41, "Serbia", 26.6, 9.0, 12.0, 2015, 2025, ["DEN"], 6, 1, false, 83, "big-scorer"],
  ["Jamal Murray", "PG", 2016, 1, 7, "Canada", 17.0, 4.6, 3.4, 2016, 2025, ["DEN"], 0, 1, false, 76, "guard-scorer"],
  ["Pascal Siakam", "PF", 2016, 1, 27, "Cameroon", 17.3, 3.3, 6.7, 2016, 2025, ["TOR", "IND"], 2, 1, false, 81, "big-scorer"],
  ["Fred VanVleet", "PG", 2016, 0, 0, "USA", 14.7, 5.9, 3.5, 2016, 2025, ["TOR", "HOU"], 0, 1, false, 73, "guard-defender"],
  ["OG Anunoby", "SF", 2017, 1, 23, "USA", 12.4, 1.7, 4.3, 2017, 2025, ["TOR", "NYK"], 0, 1, false, 79, "wing-defender"],
  ["Jrue Holiday", "PG", 2009, 1, 17, "USA", 15.7, 6.0, 4.2, 2009, 2025, ["PHI", "NOP", "MIL", "BOS", "POR"], 2, 2, false, 76, "guard-defender"],
];
RAW.push(...RECENT);

const ROLE_AND_TRAP = [
  ["Patty Mills", "PG", 2009, 2, 55, "Australia", 8.0, 2.0, 1.5, 2009, 2024, ["POR", "SAS", "BKN", "ATL", "MIA"], 0, 1, false, 72, "guard-scorer"],
  ["JJ Barea", "PG", 2006, 0, 0, "Puerto Rico", 9.5, 4.4, 2.3, 2006, 2020, ["DAL", "MIN"], 0, 1, false, 71, "guard-scorer"],
  ["Thaddeus Young", "PF", 2007, 1, 12, "USA", 12.1, 2.1, 5.4, 2007, 2022, ["PHI", "MIN", "BKN", "IND", "CHI", "SAS", "TOR"], 0, 0, false, 80, "big-defender"],
  ["Ben McLemore", "SG", 2013, 1, 7, "USA", 8.7, 1.1, 2.4, 2013, 2022, ["SAC", "MEM", "HOU", "POR"], 0, 0, false, 77, "guard-scorer"],
  ["Kendrick Nunn", "SG", 2018, 0, 0, "USA", 12.1, 2.6, 2.7, 2019, 2023, ["MIA", "LAL", "WAS"], 0, 0, false, 75, "guard-scorer"],
  ["Kyle Korver", "SG", 2003, 2, 51, "USA", 9.5, 1.6, 2.6, 2003, 2020, ["NJN", "PHI", "UTA", "CHI", "ATL", "CLE", "MIL"], 1, 0, false, 79, "guard-scorer"],
  ["Matt Bonner", "PF", 2004, 0, 0, "USA", 6.4, 0.9, 3.2, 2004, 2016, ["TOR", "SAS"], 0, 1, false, 82, "big-scorer"],
  ["Anthony Tolliver", "PF", 2007, 0, 0, "USA", 6.0, 1.0, 3.4, 2009, 2021, ["SAS", "GSW", "MIN", "PHX", "ATL", "DET", "SAC", "POR", "MEM"], 0, 0, false, 80, "big-scorer"],
  ["Jodie Meeks", "SG", 2009, 2, 41, "USA", 9.1, 1.2, 1.9, 2009, 2018, ["PHI", "MIL", "LAL", "DET", "WAS"], 0, 0, false, 76, "guard-scorer"],
  ["Luke Ridnour", "PG", 2003, 1, 14, "USA", 10.3, 4.3, 2.4, 2003, 2015, ["SEA", "MIL", "MIN", "CHA", "ORL", "OKC"], 0, 0, false, 74, "guard-scorer"],
  ["Semi Ojeleye", "SF", 2017, 2, 37, "USA", 4.2, 0.6, 2.0, 2017, 2023, ["BOS", "NOP", "PHX", "CHI"], 0, 0, false, 78, "wing-defender"],
  ["Michael Beasley", "SF", 2008, 1, 2, "USA", 13.2, 1.2, 4.7, 2008, 2019, ["MIA", "MIN", "PHX", "MIL", "NYK", "LAL"], 0, 0, false, 80, "wing-scorer"],
  ["Hasheem Thabeet", "C", 2009, 1, 2, "Tanzania", 2.2, 0.2, 2.5, 2009, 2014, ["MEM", "HOU", "POR", "OKC"], 0, 0, false, 87, "big-defender"],
  ["Pervis Ellison", "C", 1989, 1, 1, "USA", 9.5, 1.4, 6.7, 1989, 2000, ["SAC", "WSB", "BOS"], 0, 0, false, 82, "big-defender"],
  ["Joe Alexander", "SF", 2008, 1, 8, "USA", 3.9, 0.4, 1.7, 2008, 2010, ["MIL"], 0, 0, false, 80, "wing-scorer"],
  ["Darius Morris", "PG", 2011, 2, 41, "USA", 4.3, 2.6, 1.5, 2011, 2015, ["LAL", "MEM", "PHI", "WAS"], 0, 0, false, 76, "guard-scorer"],
  ["Isaiah Briscoe", "PG", 2017, 0, 0, "USA", 2.0, 1.5, 1.2, 2018, 2019, ["ORL"], 0, 0, false, 75, "guard-defender"],
  ["Demetrius Jackson", "PG", 2016, 2, 45, "USA", 1.5, 0.8, 0.5, 2016, 2018, ["BOS", "PHI"], 0, 0, false, 73, "guard-scorer"],
  ["Mangok Mathiang", "C", 2017, 0, 0, "South Sudan", 1.0, 0.1, 1.5, 2017, 2019, ["CHA"], 0, 0, false, 83, "big-defender"],
];
RAW.push(...ROLE_AND_TRAP);

const MORE_INTL_AND_HISTORIC = [
  ["Toni Kukoc", "SF", 1990, 2, 29, "Croatia", 11.6, 3.7, 4.2, 1993, 2006, ["CHI", "PHI", "ATL", "MIL"], 0, 3, true, 82, "wing-scorer"],
  ["Drazen Petrovic", "SG", 1986, 3, 60, "Croatia", 12.6, 2.2, 2.0, 1989, 1993, ["POR", "NJN"], 0, 0, true, 76, "guard-scorer"],
  ["Arvydas Sabonis", "C", 1986, 1, 24, "Lithuania", 12.0, 2.2, 7.3, 1995, 2003, ["POR"], 0, 0, true, 87, "big-scorer"],
  ["Peja Stojakovic", "SF", 1996, 1, 14, "Serbia", 17.0, 1.6, 4.1, 1998, 2011, ["SAC", "IND", "NOH", "DAL", "TOR"], 3, 1, false, 82, "wing-scorer"],
  ["Hedo Turkoglu", "SF", 2000, 1, 16, "Turkey", 11.1, 3.1, 3.9, 2000, 2015, ["SAC", "SAS", "ORL", "TOR", "PHX", "LAC", "MIA"], 0, 0, false, 81, "wing-scorer"],
  ["Andrea Bargnani", "PF", 2006, 1, 1, "Italy", 14.3, 1.1, 4.7, 2006, 2016, ["TOR", "NYK", "BKN"], 0, 0, false, 84, "big-scorer"],
  ["Darko Milicic", "C", 2003, 1, 2, "Serbia", 6.0, 0.7, 3.7, 2003, 2013, ["DET", "ORL", "MEM", "MIN", "BOS"], 0, 1, false, 84, "big-defender"],
  ["Nikoloz Tskitishvili", "PF", 2002, 1, 5, "Georgia", 2.9, 0.5, 1.7, 2002, 2006, ["DEN", "GSW", "PHX"], 0, 0, false, 84, "big-scorer"],
  ["Jan Vesely", "PF", 2011, 1, 6, "Czech Republic", 4.8, 0.6, 3.3, 2011, 2015, ["WAS", "DEN"], 0, 0, false, 82, "big-defender"],
  ["Anthony Bennett", "PF", 2013, 1, 1, "Canada", 4.4, 0.5, 3.0, 2013, 2017, ["CLE", "MIN", "TOR", "BKN"], 0, 0, false, 80, "big-scorer"],
  ["Kwame Brown", "C", 2001, 1, 1, "USA", 6.6, 1.0, 5.5, 2001, 2013, ["WSB", "LAL", "MEM", "CHA", "GSW", "PHI"], 0, 0, false, 83, "big-defender"],
  ["Greg Oden", "C", 2007, 1, 1, "USA", 8.0, 0.5, 6.2, 2008, 2014, ["POR", "MIA"], 0, 0, false, 85, "big-defender"],
  ["Adam Morrison", "SF", 2006, 1, 3, "USA", 7.5, 1.0, 1.9, 2006, 2010, ["CHA", "LAL"], 0, 2, false, 80, "wing-scorer"],
  ["Jonny Flynn", "PG", 2009, 1, 6, "USA", 8.9, 4.2, 2.0, 2009, 2012, ["MIN", "HOU", "POR"], 0, 0, false, 73, "guard-scorer"],
  ["Marvin Bagley III", "PF", 2018, 1, 2, "USA", 13.6, 0.8, 6.9, 2018, 2025, ["SAC", "DET", "WAS"], 0, 0, false, 83, "big-scorer"],
  ["Markelle Fultz", "PG", 2017, 1, 1, "USA", 10.9, 4.8, 3.4, 2017, 2025, ["PHI", "ORL"], 0, 0, false, 75, "guard-scorer"],
];
RAW.push(...MORE_INTL_AND_HISTORIC);

const EXTRA_DEPTH = [
  ["Bill Walton", "C", 1974, 1, 1, "USA", 13.3, 3.4, 10.5, 1974, 1987, ["POR", "SDC", "BOS"], 2, 2, true, 83, "big-defender"],
  ["Sam Jones", "SG", 1957, 1, 8, "USA", 17.7, 2.5, 4.9, 1957, 1969, ["BOS"], 5, 10, true, 76, "guard-scorer"],
  ["John Havlicek", "SF", 1962, 1, 9, "USA", 20.8, 4.8, 6.3, 1962, 1978, ["BOS"], 13, 8, true, 78, "wing-scorer"],
  ["Bob Pettit", "PF", 1954, 1, 2, "USA", 26.4, 3.0, 16.2, 1954, 1965, ["MLH", "STL"], 11, 1, true, 81, "big-scorer"],
  ["Dolph Schayes", "PF", 1948, 0, 0, "USA", 18.2, 3.1, 12.1, 1948, 1964, ["SYR", "PHI"], 12, 1, true, 80, "big-scorer"],
  ["Lenny Wilkens", "PG", 1960, 1, 6, "USA", 16.5, 6.7, 4.7, 1960, 1975, ["STL", "SEA", "CLE", "POR"], 9, 0, true, 74, "guard-scorer"],
  ["Earl Monroe", "SG", 1967, 1, 2, "USA", 18.8, 3.9, 3.0, 1967, 1980, ["BAL", "NYK"], 4, 1, true, 75, "guard-scorer"],
  ["Nate Archibald", "PG", 1970, 2, 19, "USA", 18.8, 7.4, 2.3, 1970, 1984, ["CIN", "KCK", "NYN", "BOS", "MIL"], 6, 1, true, 73, "guard-scorer"],
  ["Connie Hawkins", "SF", 1969, 1, 1, "USA", 16.5, 4.0, 8.0, 1969, 1976, ["PHX", "LAL", "ATL"], 4, 0, true, 80, "wing-scorer"],
  ["Billy Cunningham", "SF", 1965, 1, 5, "USA", 21.2, 4.3, 10.4, 1965, 1976, ["PHI"], 4, 1, true, 79, "wing-scorer"],
  ["Gus Williams", "PG", 1975, 1, 20, "USA", 17.1, 4.8, 3.0, 1975, 1987, ["GSW", "SEA", "WSB", "ATL"], 2, 1, false, 74, "guard-scorer"],
  ["Jack Sikma", "C", 1977, 1, 8, "USA", 15.6, 3.2, 9.8, 1977, 1991, ["SEA", "MIL"], 7, 1, true, 83, "big-defender"],
  ["Alvin Robertson", "SG", 1984, 1, 7, "USA", 16.2, 5.6, 5.2, 1984, 1996, ["SAS", "MIL", "DET", "TOR"], 4, 0, false, 75, "guard-defender"],
  ["Dale Ellis", "SF", 1983, 1, 9, "USA", 15.7, 1.9, 3.6, 1983, 2000, ["DAL", "SEA", "MIL", "SAS", "DEN", "SAC"], 1, 0, false, 79, "wing-scorer"],
  ["Terry Cummings", "PF", 1982, 1, 2, "USA", 18.9, 2.0, 8.9, 1982, 2000, ["SDC", "MIL", "SAS", "SEA", "NYK", "PHI"], 2, 0, false, 81, "big-scorer"],
  ["Xavier McDaniel", "SF", 1985, 1, 4, "USA", 16.3, 1.8, 6.7, 1985, 1997, ["SEA", "PHX", "NYK", "BOS", "NJN"], 1, 0, false, 79, "wing-scorer"],
  ["Otis Thorpe", "PF", 1984, 1, 9, "USA", 14.5, 2.0, 8.6, 1984, 2000, ["KCK", "SAC", "HOU", "DET", "VAN", "WSB", "MIA"], 0, 1, false, 82, "big-scorer"],
  ["Kevin Willis", "PF", 1984, 1, 11, "USA", 12.6, 1.1, 7.5, 1984, 2007, ["ATL", "MIA", "HOU", "TOR", "DEN", "DAL", "SAS"], 1, 0, false, 83, "big-scorer"],
  ["Larry Nance", "PF", 1981, 1, 20, "USA", 17.1, 2.4, 7.7, 1981, 1994, ["PHX", "CLE"], 3, 0, false, 82, "big-scorer"],
  ["Mark Aguirre", "SF", 1981, 1, 1, "USA", 20.0, 2.7, 5.1, 1981, 1993, ["DAL", "DET", "LAC"], 3, 2, false, 79, "wing-scorer"],
];
RAW.push(...EXTRA_DEPTH);

const MODERN_ROLE_DEPTH = [
  ["Danny Green", "SG", 2009, 2, 46, "USA", 8.9, 1.5, 3.1, 2009, 2022, ["CLE", "SAS", "TOR", "LAL", "PHI"], 0, 3, false, 78, "wing-defender"],
  ["Robert Covington", "SF", 2013, 0, 0, "USA", 10.9, 1.3, 5.4, 2014, 2024, ["PHI", "MIN", "HOU", "POR", "LAC", "MIL", "CLE"], 0, 0, false, 80, "wing-defender"],
  ["PJ Tucker", "PF", 2006, 2, 35, "USA", 6.4, 1.3, 4.6, 2012, 2024, ["PHX", "HOU", "TOR", "MIL", "PHI", "LAC"], 0, 1, false, 78, "big-defender"],
  ["Trevor Ariza", "SF", 2004, 2, 43, "USA", 10.3, 2.1, 4.4, 2004, 2021, ["NYK", "ORL", "LAL", "HOU", "NOH", "WSB", "SAC", "POR", "MIA"], 0, 1, false, 80, "wing-defender"],
  ["Marcus Smart", "PG", 2014, 1, 6, "USA", 10.5, 4.4, 3.6, 2014, 2025, ["BOS", "MEM", "WAS"], 0, 0, false, 75, "guard-defender"],
  ["Mikal Bridges", "SF", 2018, 1, 10, "USA", 15.4, 3.0, 4.1, 2018, 2025, ["PHX", "BKN", "NYK"], 1, 0, false, 78, "wing-defender"],
  ["Duncan Robinson", "SG", 2018, 0, 0, "USA", 10.7, 1.9, 2.5, 2018, 2025, ["MIA"], 0, 0, false, 79, "guard-scorer"],
  ["Joe Ingles", "SF", 2014, 0, 0, "Australia", 8.5, 3.4, 3.1, 2014, 2024, ["UTA", "MIL", "ORL", "MIN"], 0, 0, false, 80, "wing-scorer"],
  ["Bruce Bowen", "SF", 1993, 2, 35, "USA", 6.4, 1.2, 2.7, 1997, 2009, ["MIA", "BOS", "PHI", "SAS"], 0, 3, false, 79, "wing-defender"],
  ["Shane Battier", "SF", 2001, 1, 6, "USA", 8.6, 1.7, 4.1, 2001, 2014, ["MEM", "HOU", "MIA"], 0, 2, false, 80, "wing-defender"],
  ["Raja Bell", "SG", 1999, 2, 52, "USA", 9.6, 2.1, 2.8, 2001, 2011, ["PHI", "MIA", "UTA", "DAL", "PHX", "CHA", "GSW"], 0, 0, false, 77, "guard-defender"],
  ["Bruce Brown", "SG", 2018, 2, 42, "USA", 9.1, 2.6, 4.0, 2018, 2025, ["DET", "BKN", "DEN", "IND", "TOR"], 0, 1, false, 76, "guard-defender"],
  ["Alex Caruso", "PG", 2016, 0, 0, "USA", 7.9, 2.9, 2.7, 2018, 2025, ["LAL", "CHI", "OKC"], 0, 1, false, 77, "guard-defender"],
  ["T.J. McConnell", "PG", 2015, 0, 0, "USA", 7.7, 4.4, 2.7, 2015, 2025, ["PHI", "IND"], 0, 0, false, 73, "guard-defender"],
  ["Wesley Matthews", "SG", 2009, 0, 0, "USA", 11.5, 1.8, 2.7, 2009, 2023, ["UTA", "POR", "DAL", "NYK", "IND", "MIL", "LAL", "MIA", "ATL"], 0, 1, false, 77, "guard-defender"],
];
RAW.push(...MODERN_ROLE_DEPTH);

const HISTORIC_PIONEERS = [
  ["Chuck Cooper", "SF", 1950, 2, 14, "USA", 6.7, 1.8, 5.9, 1950, 1956, ["BOS", "MLH", "FTW"], 0, 0, false, 78, "wing-defender"],
  ["Earl Lloyd", "PF", 1950, 9, 100, "USA", 8.4, 1.4, 6.4, 1950, 1960, ["WSC", "SYR", "DET"], 0, 1, false, 79, "big-defender"],
  ["Sweetwater Clifton", "C", 1950, 0, 0, "USA", 10.0, 2.8, 8.2, 1950, 1958, ["NYK", "DET"], 0, 0, false, 81, "big-scorer"],
];
RAW.push(...HISTORIC_PIONEERS);

const PLAYOFF_AND_SPECIALISTS = [
  ["Robert Horry", "PF", 1992, 1, 11, "USA", 7.0, 2.1, 4.8, 1992, 2008, ["HOU", "PHX", "LAL", "SAS"], 0, 7, false, 81, "big-scorer"],
  ["Steve Kerr", "PG", 1988, 2, 50, "USA", 6.0, 2.3, 1.0, 1988, 2003, ["PHX", "CLE", "ORL", "CHI", "SAS", "POR"], 0, 5, false, 75, "guard-scorer"],
  ["John Paxson", "SG", 1983, 1, 19, "USA", 8.7, 2.9, 1.6, 1983, 1994, ["SAS", "CHI"], 0, 3, false, 74, "guard-scorer"],
  ["Derek Fisher", "PG", 1996, 1, 24, "USA", 8.3, 3.0, 2.2, 1996, 2014, ["LAL", "GSW", "UTA", "OKC", "DAL"], 0, 5, false, 73, "guard-scorer"],
];
RAW.push(...PLAYOFF_AND_SPECIALISTS);

const NINETIES_DEPTH = [
  ["Horace Grant", "PF", 1987, 1, 10, "USA", 12.0, 2.5, 8.6, 1987, 2004, ["CHI", "ORL", "SEA", "LAL"], 1, 4, false, 82, "big-defender"],
  ["Dan Majerle", "SG", 1988, 1, 14, "USA", 12.0, 3.4, 4.0, 1988, 2002, ["PHX", "CLE", "MIA"], 3, 0, false, 78, "guard-defender"],
  ["Kevin Johnson", "PG", 1987, 1, 7, "USA", 17.9, 9.1, 3.0, 1987, 2000, ["CLE", "PHX"], 3, 0, false, 73, "guard-scorer"],
  ["Danny Manning", "PF", 1988, 1, 1, "USA", 14.5, 2.9, 5.5, 1988, 2003, ["LAC", "ATL", "PHX", "MIL", "UTA", "DET"], 1, 0, false, 82, "big-scorer"],
  ["Derrick Coleman", "PF", 1990, 1, 1, "USA", 16.5, 2.9, 9.3, 1990, 2005, ["NJN", "PHI", "CHA", "DET"], 1, 0, false, 82, "big-scorer"],
  ["Larry Johnson", "PF", 1991, 1, 1, "USA", 16.2, 3.4, 7.5, 1991, 2001, ["CHH", "NYK"], 2, 0, false, 78, "big-scorer"],
  ["Christian Laettner", "PF", 1992, 1, 3, "USA", 13.2, 2.8, 6.7, 1992, 2005, ["MIN", "ATL", "DET", "DAL", "WAS", "MIA"], 1, 0, false, 83, "big-scorer"],
  ["Shawn Kemp", "PF", 1989, 1, 17, "USA", 14.6, 1.6, 8.4, 1989, 2003, ["SEA", "CLE", "POR", "ORL"], 6, 0, false, 82, "big-scorer"],
  ["Glenn Robinson", "SF", 1994, 1, 1, "USA", 20.7, 2.4, 6.1, 1994, 2005, ["MIL", "ATL", "PHI", "SAS"], 2, 1, false, 79, "wing-scorer"],
  ["Jason Williams", "PG", 1998, 1, 7, "USA", 11.9, 5.9, 2.7, 1998, 2011, ["SAC", "MEM", "MIA"], 0, 1, false, 75, "guard-scorer"],
  ["Steve Smith", "SG", 1991, 1, 5, "USA", 14.8, 3.9, 3.4, 1991, 2005, ["MIA", "ATL", "POR", "SAS", "CHA", "NOH"], 1, 0, false, 79, "guard-scorer"],
  ["Terrell Brandon", "PG", 1991, 1, 11, "USA", 14.6, 6.7, 2.7, 1991, 2003, ["CLE", "MIL", "MIN"], 2, 0, false, 71, "guard-scorer"],
  ["Anfernee Hardaway", "PG", 1993, 1, 3, "USA", 15.2, 4.9, 4.0, 1993, 2007, ["ORL", "PHX", "NYK", "MIA"], 4, 0, false, 79, "guard-scorer"],
  ["Jamal Mashburn", "SF", 1993, 1, 4, "USA", 19.1, 4.0, 5.4, 1993, 2004, ["DAL", "MIA", "CHH"], 1, 0, false, 80, "wing-scorer"],
  ["Chris Gatling", "PF", 1991, 1, 16, "USA", 11.8, 1.0, 5.6, 1991, 2001, ["GSW", "MIA", "DAL", "MIL", "NJN", "ORL", "LAC"], 0, 0, false, 82, "big-scorer"],
  ["Vin Baker", "PF", 1993, 1, 8, "USA", 15.0, 1.9, 8.1, 1993, 2006, ["MIL", "SEA", "BOS", "NYK", "HOU", "LAC"], 4, 0, false, 83, "big-scorer"],
  ["Rik Smits", "C", 1988, 1, 2, "Netherlands", 14.8, 1.0, 6.1, 1988, 2000, ["IND"], 1, 0, false, 88, "big-scorer"],
  ["Reggie Lewis", "SF", 1987, 1, 22, "USA", 17.6, 2.9, 3.8, 1987, 1993, ["BOS"], 1, 0, false, 79, "wing-scorer"],
  ["Sam Perkins", "PF", 1984, 1, 4, "USA", 12.5, 1.9, 6.4, 1984, 2001, ["DAL", "LAL", "SEA", "IND"], 0, 0, false, 81, "big-scorer"],
  ["Kenny Anderson", "PG", 1991, 1, 2, "USA", 12.6, 6.1, 2.9, 1991, 2005, ["NJN", "CHH", "POR", "BOS", "SEA", "IND", "LAC"], 2, 0, false, 74, "guard-scorer"],
  ["Nick Van Exel", "PG", 1993, 2, 37, "USA", 14.4, 6.6, 3.1, 1993, 2006, ["LAL", "DEN", "DAL", "GSW", "POR", "SAS"], 1, 0, false, 73, "guard-scorer"],
  ["Antoine Walker", "PF", 1996, 1, 6, "USA", 17.5, 3.7, 8.3, 1996, 2008, ["BOS", "DAL", "ATL", "MIA", "MIN"], 3, 1, false, 81, "big-scorer"],
  ["Eddie Jones", "SG", 1994, 1, 10, "USA", 14.5, 2.6, 3.6, 1994, 2008, ["LAL", "CHH", "MIA", "MEM"], 1, 0, false, 78, "guard-defender"],
  ["Bryant Reeves", "C", 1995, 1, 6, "USA", 13.3, 1.6, 6.7, 1995, 2001, ["VAN"], 0, 0, false, 84, "big-scorer"],
];
RAW.push(...NINETIES_DEPTH);

const TWO_THOUSANDS_DEPTH = [
  ["Andre Miller", "PG", 1999, 1, 8, "USA", 12.7, 6.7, 3.5, 1999, 2015, ["CLE", "LAC", "DEN", "PHI", "POR", "SAS", "MIN"], 0, 0, false, 75, "guard-scorer"],
  ["Corey Maggette", "SF", 1999, 1, 13, "USA", 16.8, 2.1, 5.0, 1999, 2013, ["ORL", "LAC", "GSW", "CHA", "DET"], 0, 0, false, 78, "wing-scorer"],
  ["Michael Redd", "SG", 2000, 2, 43, "USA", 18.6, 2.1, 3.1, 2000, 2011, ["MIL", "PHX"], 1, 0, false, 78, "guard-scorer"],
  ["Joe Johnson", "SG", 2001, 1, 10, "USA", 16.9, 4.6, 4.0, 2001, 2018, ["BOS", "PHX", "ATL", "BKN", "MIA", "HOU"], 7, 0, false, 79, "wing-scorer"],
  ["Caron Butler", "SF", 2002, 1, 10, "USA", 14.9, 2.8, 5.2, 2002, 2016, ["MIA", "LAL", "WAS", "DAL", "LAC", "MIL", "SAC", "DET"], 2, 1, false, 79, "wing-scorer"],
  ["Josh Howard", "SF", 2003, 1, 29, "USA", 14.7, 2.0, 5.0, 2003, 2013, ["DAL", "WAS", "UTA", "MIN"], 1, 0, false, 79, "wing-defender"],
  ["Marcus Camby", "C", 1996, 1, 2, "USA", 9.8, 1.5, 9.4, 1996, 2013, ["TOR", "NYK", "DEN", "LAC", "POR", "HOU"], 1, 0, false, 83, "big-defender"],
  ["Zach Randolph", "PF", 2001, 1, 19, "USA", 17.1, 2.1, 9.9, 2001, 2019, ["POR", "NYK", "LAC", "MEM", "SAC"], 2, 0, false, 81, "big-scorer"],
  ["Josh Smith", "PF", 2004, 1, 17, "USA", 13.8, 3.1, 7.0, 2004, 2017, ["ATL", "DET", "HOU", "LAC"], 1, 0, false, 81, "big-scorer"],
  ["Al Jefferson", "C", 2004, 1, 15, "USA", 16.4, 1.6, 9.2, 2004, 2018, ["BOS", "MIN", "UTA", "CHA", "IND"], 1, 0, false, 82, "big-scorer"],
  ["Monta Ellis", "SG", 2005, 2, 40, "USA", 18.9, 4.3, 3.1, 2005, 2017, ["GSW", "MIL", "DAL", "IND"], 1, 0, false, 75, "guard-scorer"],
  ["Nate Robinson", "PG", 2005, 1, 21, "USA", 11.0, 3.3, 2.1, 2005, 2015, ["NYK", "BOS", "OKC", "GSW", "CHI", "DEN", "NOP"], 0, 1, false, 69, "guard-scorer"],
  ["Devin Harris", "PG", 2004, 1, 5, "USA", 12.7, 4.7, 2.2, 2004, 2019, ["WAS", "DAL", "NJN", "UTA", "ATL", "DEN"], 1, 0, false, 75, "guard-scorer"],
  ["Marc Gasol", "C", 2007, 2, 48, "Spain", 14.5, 3.3, 7.7, 2008, 2021, ["MEM", "TOR", "LAL"], 3, 1, false, 83, "big-defender"],
  ["Serge Ibaka", "PF", 2008, 1, 24, "Republic of the Congo", 11.5, 1.0, 7.0, 2009, 2022, ["OKC", "ORL", "TOR", "LAC", "MIL"], 1, 1, false, 82, "big-defender"],
  ["Kendrick Perkins", "C", 2003, 1, 27, "USA", 6.7, 0.8, 5.9, 2003, 2018, ["BOS", "OKC", "CLE", "NOP"], 0, 1, false, 82, "big-defender"],
  ["Nene Hilario", "C", 2002, 1, 7, "Brazil", 11.5, 1.5, 6.5, 2002, 2020, ["DEN", "WAS", "HOU"], 1, 0, false, 83, "big-scorer"],
  ["Boris Diaw", "PF", 2003, 1, 21, "France", 8.7, 3.3, 4.2, 2003, 2017, ["ATL", "PHX", "CHA", "SAS", "UTA"], 0, 1, false, 80, "big-scorer"],
  ["Luol Deng", "SF", 2004, 1, 7, "Sudan", 14.6, 2.1, 6.0, 2004, 2019, ["CHI", "CLE", "MIA", "LAL", "MIN"], 2, 0, false, 81, "wing-defender"],
];
RAW.push(...TWO_THOUSANDS_DEPTH);

const TWENTY_TENS_DEPTH = [
  ["Nikola Vucevic", "C", 2011, 1, 16, "Montenegro", 16.4, 2.7, 10.4, 2011, 2025, ["PHI", "ORL", "CHI"], 2, 0, false, 83, "big-scorer"],
  ["Isaiah Thomas", "PG", 2011, 2, 60, "USA", 15.9, 4.5, 2.5, 2011, 2023, ["SAC", "PHX", "BOS", "CLE", "LAL", "WAS", "NOP"], 2, 0, false, 69, "guard-scorer"],
  ["Lou Williams", "SG", 2005, 2, 45, "USA", 13.9, 3.2, 2.0, 2005, 2021, ["PHI", "ATL", "LAC", "HOU"], 0, 0, false, 75, "guard-scorer"],
  ["Marcus Morris", "PF", 2011, 1, 14, "USA", 12.5, 1.7, 4.0, 2011, 2024, ["HOU", "PHX", "DET", "BOS", "NYK", "SAS", "LAC", "CLE"], 0, 0, false, 81, "big-scorer"],
  ["Nikola Mirotic", "PF", 2011, 1, 23, "Montenegro", 11.9, 1.2, 5.1, 2015, 2019, ["CHI", "NOP", "MIL"], 0, 0, false, 82, "big-scorer"],
  ["Enes Kanter", "C", 2011, 1, 3, "Turkey", 10.9, 1.0, 7.9, 2011, 2022, ["UTA", "OKC", "NYK", "POR", "BOS", "HOU"], 0, 0, false, 83, "big-scorer"],
  ["Nerlens Noel", "C", 2013, 1, 6, "USA", 7.5, 0.9, 6.1, 2013, 2023, ["PHI", "DAL", "OKC", "NYK", "DET", "SAC"], 0, 0, false, 83, "big-defender"],
  ["Otto Porter", "SF", 2013, 1, 3, "USA", 10.2, 1.4, 4.6, 2013, 2023, ["WAS", "CHI", "OKC", "ORL", "TOR", "GSW"], 0, 1, false, 80, "wing-defender"],
  ["Michael Carter-Williams", "PG", 2013, 1, 11, "USA", 9.8, 4.9, 3.9, 2013, 2021, ["PHI", "MIL", "CHI", "HOU", "ORL"], 0, 0, false, 78, "guard-defender"],
  ["Dario Saric", "PF", 2014, 1, 12, "Croatia", 11.4, 2.4, 5.5, 2016, 2023, ["PHI", "MIN", "PHX"], 0, 0, false, 82, "big-scorer"],
  ["Tyus Jones", "PG", 2015, 1, 24, "USA", 9.0, 5.4, 2.3, 2015, 2025, ["MIN", "MEM", "WAS", "PHX"], 0, 0, false, 73, "guard-defender"],
  ["Delon Wright", "PG", 2015, 1, 20, "USA", 8.9, 3.9, 3.2, 2015, 2024, ["TOR", "MEM", "DAL", "SAC", "WAS", "ATL"], 0, 0, false, 78, "guard-defender"],
  ["Kelly Olynyk", "C", 2013, 1, 13, "Canada", 9.8, 2.4, 5.0, 2013, 2024, ["BOS", "MIA", "UTA", "DET"], 0, 0, false, 84, "big-scorer"],
  ["Cody Zeller", "C", 2013, 1, 4, "USA", 8.7, 1.3, 6.1, 2013, 2023, ["CHA", "POR", "MIA", "NOP"], 0, 0, false, 83, "big-scorer"],
  ["Willie Cauley-Stein", "C", 2015, 1, 6, "USA", 8.5, 1.7, 6.4, 2015, 2022, ["SAC", "GSW", "DAL"], 0, 0, false, 84, "big-defender"],
  ["Jerami Grant", "PF", 2014, 2, 39, "USA", 13.7, 1.8, 4.1, 2014, 2025, ["PHI", "OKC", "DEN", "DET", "POR"], 0, 0, false, 80, "big-scorer"],
  ["Aaron Gordon", "PF", 2014, 1, 4, "USA", 14.4, 2.7, 6.6, 2014, 2025, ["ORL", "DEN"], 0, 1, false, 80, "big-scorer"],
  ["Terrence Ross", "SG", 2012, 1, 8, "USA", 12.2, 1.6, 2.9, 2012, 2025, ["TOR", "ORL", "PHX"], 0, 0, false, 78, "guard-scorer"],
  ["Harrison Barnes", "SF", 2012, 1, 7, "USA", 14.3, 1.8, 4.5, 2012, 2025, ["GSW", "DAL", "SAC", "SAS"], 0, 1, false, 80, "wing-scorer"],
  ["Kentavious Caldwell-Pope", "SG", 2013, 1, 8, "USA", 11.3, 1.9, 2.9, 2013, 2025, ["DET", "LAL", "DEN", "ORL"], 0, 2, false, 78, "guard-defender"],
];
RAW.push(...TWENTY_TENS_DEPTH);

const RECENT_DEPTH = [
  ["Tyrese Haliburton", "PG", 2020, 1, 12, "USA", 16.9, 8.7, 3.7, 2020, 2025, ["SAC", "IND"], 2, 0, false, 76, "guard-scorer"],
  ["Desmond Bane", "SG", 2020, 1, 30, "USA", 18.5, 4.5, 4.7, 2020, 2025, ["MEM", "ORL"], 1, 0, false, 76, "guard-scorer"],
  ["Tyrese Maxey", "PG", 2020, 1, 21, "USA", 20.3, 5.1, 3.0, 2020, 2025, ["PHI"], 1, 0, false, 74, "guard-scorer"],
  ["Franz Wagner", "SF", 2021, 1, 8, "Germany", 18.9, 3.5, 5.1, 2021, 2025, ["ORL"], 0, 0, false, 80, "wing-scorer"],
  ["Evan Mobley", "PF", 2021, 1, 3, "USA", 15.8, 2.9, 8.8, 2021, 2025, ["CLE"], 1, 0, false, 83, "big-defender"],
  ["Cade Cunningham", "PG", 2021, 1, 1, "USA", 21.5, 7.4, 4.5, 2021, 2025, ["DET"], 1, 0, false, 78, "guard-scorer"],
  ["Scottie Barnes", "SF", 2021, 1, 4, "USA", 15.5, 5.4, 7.5, 2021, 2025, ["TOR"], 1, 0, false, 80, "wing-defender"],
  ["Jalen Green", "SG", 2021, 1, 2, "USA", 19.6, 3.3, 4.4, 2021, 2025, ["HOU"], 0, 0, false, 77, "guard-scorer"],
  ["Paolo Banchero", "PF", 2022, 1, 1, "USA", 22.5, 4.9, 6.9, 2022, 2025, ["ORL"], 1, 0, false, 82, "big-scorer"],
  ["Chet Holmgren", "C", 2022, 1, 2, "USA", 16.5, 2.6, 7.9, 2023, 2025, ["OKC"], 0, 0, false, 85, "big-defender"],
  ["Jabari Smith Jr.", "PF", 2022, 1, 3, "USA", 12.5, 1.6, 6.6, 2022, 2025, ["HOU"], 0, 0, false, 82, "big-scorer"],
  ["Victor Wembanyama", "C", 2023, 1, 1, "France", 21.4, 3.9, 10.6, 2023, 2025, ["SAS"], 1, 0, false, 89, "big-defender"],
  ["Brandon Miller", "SF", 2023, 1, 2, "USA", 16.1, 2.3, 4.4, 2023, 2025, ["CHA"], 0, 0, false, 80, "wing-scorer"],
  ["Amen Thompson", "SG", 2023, 1, 4, "USA", 10.4, 3.6, 5.4, 2023, 2025, ["HOU"], 0, 0, false, 78, "guard-defender"],
];
RAW.push(...RECENT_DEPTH);

const EARLY_MODERN_ROLE = [
  ["Jeff Hornacek", "SG", 1986, 2, 46, "USA", 14.5, 4.9, 3.4, 1986, 2000, ["PHX", "PHI", "UTA"], 1, 0, false, 76, "guard-scorer"],
  ["Danny Ainge", "PG", 1981, 2, 31, "USA", 11.4, 3.9, 2.5, 1981, 1995, ["BOS", "SAC", "POR", "PHX"], 2, 2, false, 76, "guard-scorer"],
  ["Rolando Blackman", "SG", 1981, 1, 9, "Panama", 17.3, 3.0, 3.2, 1981, 1993, ["DAL", "NYK"], 4, 0, false, 78, "guard-scorer"],
  ["Micheal Ray Richardson", "PG", 1978, 1, 4, "USA", 14.8, 7.3, 4.7, 1978, 1986, ["NYK", "GSW", "NJN"], 4, 0, false, 77, "guard-defender"],
  ["World B. Free", "PG", 1975, 2, 23, "USA", 20.3, 3.7, 2.9, 1975, 1988, ["PHI", "SDC", "GSW", "CLE", "HOU"], 1, 0, false, 74, "guard-scorer"],
  ["Marques Johnson", "SF", 1977, 1, 3, "USA", 20.1, 3.6, 6.6, 1977, 1990, ["MIL", "LAC", "GSW"], 5, 0, false, 79, "wing-scorer"],
];
RAW.push(...EARLY_MODERN_ROLE);

const MORE_HOF_CLASSIC = [
  ["Bob Lanier", "C", 1970, 1, 1, "USA", 20.1, 3.3, 10.1, 1970, 1984, ["DET", "MIL"], 8, 0, true, 83, "big-scorer"],
  ["Dave Bing", "PG", 1966, 1, 2, "USA", 20.3, 6.0, 3.7, 1966, 1978, ["DET", "WSB", "BOS"], 7, 0, true, 75, "guard-scorer"],
  ["Calvin Murphy", "PG", 1970, 2, 18, "USA", 17.9, 4.4, 2.1, 1970, 1983, ["HOU"], 1, 0, true, 69, "guard-scorer"],
  ["Gail Goodrich", "SG", 1965, 1, 1, "USA", 18.6, 4.7, 3.2, 1965, 1979, ["LAL", "PHX", "NOJ", "UTA"], 5, 1, true, 74, "guard-scorer"],
  ["Bailey Howell", "SF", 1959, 1, 2, "USA", 18.7, 2.4, 9.9, 1959, 1971, ["DET", "BAL", "BOS", "PHI"], 6, 2, true, 79, "wing-scorer"],
  ["Cliff Hagan", "SF", 1953, 3, 25, "USA", 18.0, 3.1, 6.9, 1956, 1970, ["STL", "DAL"], 5, 1, true, 79, "wing-scorer"],
  ["Paul Arizin", "SF", 1950, 1, 3, "USA", 22.8, 2.0, 8.6, 1950, 1962, ["PHW"], 10, 1, true, 78, "wing-scorer"],
  ["Slater Martin", "PG", 1949, 1, 4, "USA", 9.8, 4.0, 3.1, 1949, 1960, ["MNL", "NYK", "STL"], 7, 5, true, 71, "guard-defender"],
  ["Andy Phillip", "PG", 1947, 0, 0, "USA", 9.1, 4.3, 4.8, 1947, 1958, ["CHS", "PHW", "FTW", "BOS"], 5, 1, true, 76, "guard-scorer"],
  ["Bill Sharman", "SG", 1950, 2, 20, "USA", 17.8, 3.0, 3.6, 1950, 1961, ["WSC", "BOS"], 8, 4, true, 74, "guard-scorer"],
  ["Jerry Lucas", "C", 1962, 1, 1, "USA", 17.0, 3.0, 15.6, 1963, 1974, ["CIN", "SFW", "NYK"], 7, 1, true, 80, "big-scorer"],
  ["Wayne Embry", "C", 1958, 1, 3, "USA", 12.5, 1.6, 8.6, 1958, 1969, ["STL", "CIN", "BOS"], 5, 1, true, 80, "big-scorer"],
  ["Hal Greer", "SG", 1958, 2, 13, "USA", 19.2, 4.0, 5.0, 1958, 1973, ["SYR", "PHI"], 10, 1, true, 76, "guard-scorer"],
  ["Chet Walker", "SF", 1962, 2, 14, "USA", 18.2, 2.7, 7.1, 1962, 1975, ["SYR", "PHI", "CHI"], 7, 1, true, 78, "wing-scorer"],
  ["Jack Twyman", "SF", 1955, 1, 10, "USA", 19.2, 2.5, 6.6, 1955, 1966, ["ROC", "CIN"], 6, 0, true, 78, "wing-scorer"],
  ["Tom Heinsohn", "PF", 1956, 0, 0, "USA", 18.6, 2.0, 8.8, 1956, 1965, ["BOS"], 6, 8, true, 80, "big-scorer"],
  ["Frank Ramsey", "SF", 1953, 1, 5, "USA", 13.4, 2.3, 4.7, 1954, 1964, ["BOS"], 0, 7, true, 76, "wing-scorer"],
  ["K.C. Jones", "PG", 1956, 2, 10, "USA", 7.4, 4.3, 4.3, 1958, 1967, ["BOS"], 0, 8, true, 74, "guard-defender"],
  ["Bob Davies", "PG", 1948, 0, 0, "USA", 13.7, 4.0, 2.7, 1948, 1955, ["ROC"], 4, 1, true, 73, "guard-scorer"],
  ["Harry Gallatin", "PF", 1948, 3, 0, "USA", 13.1, 2.1, 11.9, 1948, 1958, ["NYK", "STL"], 7, 0, true, 79, "big-defender"],
  ["Vern Mikkelsen", "PF", 1950, 1, 0, "USA", 14.4, 1.8, 8.4, 1950, 1959, ["MNL"], 6, 4, true, 80, "big-defender"],
  ["Dick McGuire", "PG", 1949, 0, 0, "USA", 8.0, 5.8, 2.7, 1949, 1960, ["NYK", "DET"], 7, 0, true, 74, "guard-scorer"],
  ["Neil Johnston", "C", 1951, 0, 0, "USA", 19.4, 2.5, 11.3, 1951, 1959, ["PHW"], 6, 1, true, 81, "big-scorer"],
  ["Richie Guerin", "PG", 1954, 0, 0, "USA", 17.3, 4.9, 5.0, 1956, 1970, ["NYK", "STL"], 6, 0, true, 76, "guard-scorer"],
];
RAW.push(...MORE_HOF_CLASSIC);

const SEVENTIES_EIGHTIES_ROLE = [
  ["Bobby Jones", "SF", 1974, 1, 5, "USA", 12.1, 2.4, 6.1, 1974, 1986, ["DEN", "PHI"], 5, 1, true, 81, "wing-defender"],
  ["Maurice Lucas", "PF", 1974, 1, 14, "USA", 14.8, 2.1, 9.1, 1974, 1988, ["STL", "KTC", "POR", "NJN", "PHI", "LAL", "SEA"], 4, 1, false, 81, "big-scorer"],
  ["Truck Robinson", "PF", 1974, 1, 7, "USA", 15.7, 1.6, 10.4, 1974, 1985, ["ATL", "NOJ", "PHX", "NYK"], 1, 0, false, 81, "big-scorer"],
  ["M.L. Carr", "SF", 1976, 5, 78, "USA", 8.8, 2.1, 3.7, 1976, 1985, ["STL", "DET", "BOS"], 0, 2, false, 78, "wing-defender"],
  ["Kiki Vandeweghe", "SF", 1980, 1, 11, "USA", 19.7, 1.8, 4.3, 1980, 1993, ["DEN", "POR", "NYK", "LAC"], 2, 0, false, 80, "wing-scorer"],
  ["Otis Birdsong", "SG", 1977, 1, 2, "USA", 18.1, 3.0, 3.4, 1977, 1988, ["KCK", "NJN", "BOS"], 2, 0, false, 76, "guard-scorer"],
  ["Norm Nixon", "PG", 1977, 1, 22, "USA", 15.7, 8.3, 2.7, 1977, 1989, ["LAL", "SDC"], 1, 2, false, 74, "guard-scorer"],
  ["Michael Cooper", "SG", 1978, 3, 60, "USA", 8.9, 3.6, 3.1, 1978, 1990, ["LAL"], 1, 5, false, 79, "guard-defender"],
  ["Byron Scott", "SG", 1983, 1, 4, "USA", 14.1, 2.9, 3.1, 1983, 1997, ["LAL", "IND", "VAN"], 1, 3, false, 77, "guard-scorer"],
  ["A.C. Green", "PF", 1985, 1, 23, "USA", 9.6, 1.2, 7.4, 1985, 2001, ["LAL", "PHX", "DAL", "MIA"], 1, 3, false, 81, "big-defender"],
  ["Mychal Thompson", "C", 1978, 1, 1, "Bahamas", 13.7, 2.3, 7.4, 1978, 1991, ["POR", "SAS", "LAL"], 0, 2, false, 82, "big-scorer"],
  ["Rickey Green", "PG", 1977, 2, 16, "USA", 11.4, 6.4, 2.2, 1977, 1990, ["GSW", "UTA", "CHI", "CHH"], 0, 0, false, 73, "guard-scorer"],
  ["Sedale Threatt", "PG", 1983, 3, 60, "USA", 11.6, 4.0, 2.2, 1983, 1998, ["PHI", "SEA", "CHI", "LAL", "LAC", "MIL"], 0, 0, false, 74, "guard-scorer"],
  ["Ricky Pierce", "SG", 1982, 1, 18, "USA", 15.0, 2.1, 2.6, 1982, 1998, ["DET", "SDC", "MIL", "SEA", "IND", "GSW"], 2, 0, false, 77, "guard-scorer"],
  ["Jeff Malone", "SG", 1983, 1, 10, "USA", 19.0, 2.1, 2.5, 1983, 1996, ["WSB", "UTA", "PHI"], 2, 0, false, 77, "guard-scorer"],
];
RAW.push(...SEVENTIES_EIGHTIES_ROLE);

const NINETIES_TWO_THOUSANDS_MORE = [
  ["Cedric Ceballos", "SF", 1990, 2, 48, "USA", 15.9, 1.6, 5.5, 1990, 2001, ["PHX", "LAL", "DAL", "MIA", "DET", "HOU"], 1, 0, false, 79, "wing-scorer"],
  ["Doug Christie", "SG", 1992, 2, 17, "USA", 11.1, 3.4, 3.6, 1992, 2007, ["SEA", "LAL", "TOR", "SAC", "DAL", "ORL"], 0, 0, false, 78, "guard-defender"],
  ["Wesley Person", "SG", 1994, 1, 23, "USA", 11.6, 1.7, 2.4, 1994, 2005, ["PHX", "CLE", "MIA", "ATL"], 0, 0, false, 78, "guard-scorer"],
  ["Bo Outlaw", "PF", 1993, 0, 0, "USA", 5.6, 1.7, 6.1, 1993, 2007, ["LAC", "PHX", "ORL"], 0, 0, false, 80, "big-defender"],
  ["Bobby Phills", "SG", 1991, 2, 45, "USA", 11.4, 2.6, 3.0, 1991, 2000, ["CLE", "CHH"], 0, 0, false, 78, "guard-defender"],
  ["Muggsy Bogues", "PG", 1987, 1, 12, "USA", 7.7, 7.6, 2.6, 1987, 2001, ["WSB", "CHH", "GSW", "TOR"], 0, 0, false, 63, "guard-defender"],
  ["Anthony Mason", "PF", 1988, 3, 53, "USA", 10.9, 3.4, 7.3, 1989, 2003, ["NJN", "NYK", "CHH", "MIA", "MIL"], 1, 0, false, 80, "big-defender"],
  ["John Starks", "SG", 1988, 0, 0, "USA", 12.5, 4.0, 3.0, 1990, 2002, ["GSW", "NYK", "CHI", "UTA"], 1, 0, false, 77, "guard-scorer"],
  ["Charlie Ward", "PG", 1994, 1, 26, "USA", 6.4, 4.4, 2.5, 1994, 2005, ["NYK", "SAS", "HOU"], 0, 0, false, 73, "guard-defender"],
  ["Derek Harper", "PG", 1983, 2, 11, "USA", 14.7, 5.7, 2.9, 1983, 1999, ["DAL", "NYK", "LAC", "ORL"], 0, 0, false, 76, "guard-scorer"],
  ["Rod Strickland", "PG", 1988, 1, 19, "USA", 13.2, 7.3, 3.4, 1988, 2005, ["NYK", "SAS", "POR", "WSB", "MIA", "TOR", "ORL"], 1, 0, false, 74, "guard-scorer"],
  ["Rex Chapman", "SG", 1988, 1, 8, "USA", 14.6, 2.9, 2.2, 1988, 2000, ["CHH", "WSB", "MIA", "PHX"], 0, 0, false, 76, "guard-scorer"],
  ["Nick Anderson", "SF", 1989, 1, 11, "USA", 13.0, 2.4, 4.1, 1989, 2002, ["ORL", "SAC"], 0, 0, false, 79, "wing-scorer"],
  ["Dennis Scott", "SF", 1990, 1, 4, "USA", 12.2, 2.1, 3.0, 1990, 2000, ["ORL", "DAL"], 0, 0, false, 80, "wing-scorer"],
  ["Cliff Robinson", "PF", 1989, 2, 36, "USA", 14.2, 1.9, 6.0, 1989, 2007, ["POR", "PHX", "DET", "GSW", "NJN"], 1, 0, false, 82, "big-scorer"],
  ["Chris Dudley", "C", 1987, 4, 75, "USA", 4.9, 0.5, 8.9, 1987, 2003, ["CLE", "NJN", "POR", "NYK"], 0, 0, false, 83, "big-defender"],
  ["Jayson Williams", "PF", 1990, 1, 21, "USA", 6.3, 0.6, 6.8, 1991, 2000, ["PHX", "NJN"], 1, 0, false, 82, "big-defender"],
  ["Danny Fortson", "PF", 1997, 1, 10, "USA", 8.6, 0.7, 5.9, 1997, 2007, ["BOS", "DEN", "GSW", "SEA"], 0, 0, false, 80, "big-scorer"],
  ["Scot Pollard", "C", 1997, 1, 19, "USA", 4.6, 0.7, 4.6, 1997, 2008, ["DET", "SAC", "IND", "CLE", "BOS"], 0, 1, false, 83, "big-defender"],
  ["Brian Skinner", "PF", 1998, 2, 22, "USA", 5.9, 0.5, 4.5, 1998, 2010, ["PHI", "LAC", "MIL", "NOH", "PHX", "MIN", "CHA"], 0, 0, false, 82, "big-defender"],
  ["Loren Woods", "C", 2001, 1, 30, "USA", 3.6, 0.4, 2.3, 2001, 2006, ["MIA", "DEN", "TOR", "MIN", "ATL"], 0, 0, false, 85, "big-defender"],
];
RAW.push(...NINETIES_TWO_THOUSANDS_MORE);

const TWENTY_TENS_TWENTIES_ROLE = [
  ["Timothe Luwawu-Cabarrot", "SG", 2016, 1, 24, "France", 6.6, 1.0, 2.1, 2016, 2023, ["PHI", "ORL", "OKC", "NOP", "BKN"], 0, 0, false, 78, "wing-defender"],
  ["Furkan Korkmaz", "SG", 2016, 1, 26, "Turkey", 7.8, 1.4, 2.2, 2016, 2024, ["PHI"], 0, 0, false, 79, "guard-scorer"],
  ["Bogdan Bogdanovic", "SG", 2014, 1, 27, "Serbia", 13.6, 3.1, 3.1, 2017, 2025, ["SAC", "ATL"], 0, 0, false, 78, "guard-scorer"],
  ["Dennis Schroder", "PG", 2013, 1, 17, "Germany", 14.7, 5.2, 2.9, 2013, 2025, ["ATL", "OKC", "LAL", "BOS", "HOU", "TOR", "BKN"], 0, 0, false, 73, "guard-scorer"],
  ["Cory Joseph", "PG", 2011, 1, 29, "Canada", 7.5, 2.9, 2.0, 2011, 2024, ["SAS", "TOR", "IND", "SAC", "DET", "GSW"], 0, 1, false, 75, "guard-defender"],
  ["Landry Shamet", "SG", 2018, 1, 26, "USA", 9.0, 1.8, 2.4, 2018, 2025, ["PHI", "LAC", "BKN", "PHX", "WAS"], 0, 0, false, 76, "guard-scorer"],
  ["Davis Bertans", "PF", 2011, 2, 42, "Latvia", 8.9, 0.9, 3.1, 2016, 2023, ["SAS", "WAS", "OKC"], 0, 0, false, 82, "big-scorer"],
  ["Ersan Ilyasova", "PF", 2005, 2, 36, "Turkey", 10.1, 1.4, 5.6, 2006, 2022, ["MIL", "DET", "ORL", "PHI", "ATL", "OKC", "PHX", "SAS", "UTA"], 0, 0, false, 82, "big-scorer"],
  ["Timofey Mozgov", "C", 2010, 1, 20, "Russia", 6.6, 0.6, 4.9, 2011, 2018, ["NYK", "DEN", "CLE", "LAL"], 0, 1, false, 85, "big-defender"],
  ["Boban Marjanovic", "C", 2014, 0, 0, "Serbia", 6.6, 0.7, 4.4, 2015, 2024, ["SAS", "DET", "PHI", "DAL", "HOU"], 0, 0, false, 89, "big-scorer"],
  ["Ivica Zubac", "C", 2016, 2, 32, "Croatia", 10.6, 1.4, 8.0, 2016, 2025, ["LAL", "LAC"], 0, 0, false, 84, "big-defender"],
  ["Dwight Powell", "C", 2014, 0, 0, "Canada", 8.5, 1.1, 4.3, 2014, 2025, ["CHA", "DAL"], 0, 0, false, 82, "big-scorer"],
  ["Meyers Leonard", "C", 2012, 1, 11, "USA", 6.8, 0.9, 3.9, 2012, 2021, ["POR", "MIA"], 0, 0, false, 84, "big-scorer"],
  ["Nemanja Bjelica", "PF", 2010, 2, 35, "Serbia", 7.8, 1.7, 4.4, 2015, 2022, ["MIN", "GSW", "SAC", "MIA"], 0, 0, false, 82, "big-scorer"],
  ["Georgios Papagiannis", "C", 2016, 1, 13, "Greece", 3.4, 0.4, 2.7, 2016, 2019, ["SAC"], 0, 0, false, 85, "big-scorer"],
  ["Frank Ntilikina", "PG", 2017, 1, 8, "France", 5.4, 2.2, 1.9, 2017, 2024, ["NYK", "DAL"], 0, 0, false, 77, "guard-defender"],
  ["Dragan Bender", "PF", 2016, 1, 4, "Croatia", 4.4, 1.0, 2.9, 2016, 2020, ["PHX", "MIL"], 0, 0, false, 84, "big-defender"],
  ["Thon Maker", "C", 2016, 1, 10, "South Sudan", 5.1, 0.6, 2.8, 2016, 2021, ["MIL", "DET"], 0, 0, false, 83, "big-defender"],
  ["Skal Labissiere", "PF", 2016, 1, 28, "Haiti", 6.5, 0.5, 3.4, 2016, 2020, ["SAC", "POR"], 0, 0, false, 83, "big-scorer"],
  ["Isaiah Whitehead", "PG", 2016, 2, 42, "USA", 4.3, 1.5, 1.5, 2016, 2018, ["BKN"], 0, 0, false, 76, "guard-scorer"],
];
RAW.push(...TWENTY_TENS_TWENTIES_ROLE);

const MODERN_STARTERS_MORE = [
  ["Jonas Valanciunas", "C", 2011, 1, 5, "Lithuania", 13.4, 1.4, 9.4, 2012, 2025, ["TOR", "MEM", "NOP"], 0, 0, false, 84, "big-scorer"],
  ["Steven Adams", "C", 2013, 1, 12, "New Zealand", 9.0, 1.4, 8.6, 2013, 2025, ["OKC", "NOP", "MEM", "HOU"], 0, 0, false, 84, "big-defender"],
  ["Clint Capela", "C", 2014, 2, 25, "Switzerland", 11.2, 0.9, 9.7, 2014, 2025, ["HOU", "ATL"], 1, 0, false, 82, "big-defender"],
  ["Montrezl Harrell", "PF", 2015, 2, 32, "USA", 11.9, 1.3, 5.5, 2015, 2024, ["HOU", "LAC", "LAL", "WAS", "CHI", "PHI"], 0, 0, false, 80, "big-scorer"],
  ["Jusuf Nurkic", "C", 2014, 1, 16, "Bosnia and Herzegovina", 11.5, 2.9, 9.1, 2014, 2025, ["DEN", "POR", "PHX", "CHA"], 0, 0, false, 84, "big-scorer"],
  ["Jarrett Allen", "C", 2017, 1, 22, "USA", 12.9, 1.6, 8.9, 2017, 2025, ["BKN", "CLE"], 1, 0, false, 82, "big-defender"],
  ["Mitchell Robinson", "C", 2018, 0, 0, "USA", 6.9, 0.7, 8.1, 2018, 2025, ["NYK"], 0, 0, false, 83, "big-defender"],
  ["Deandre Ayton", "C", 2018, 1, 1, "Bahamas", 16.3, 1.5, 9.9, 2018, 2025, ["PHX", "POR"], 1, 0, false, 84, "big-scorer"],
  ["Jaren Jackson Jr.", "PF", 2018, 1, 4, "USA", 16.9, 1.2, 5.6, 2018, 2025, ["MEM"], 2, 0, false, 82, "big-defender"],
  ["Wendell Carter Jr.", "C", 2018, 1, 7, "USA", 11.8, 2.1, 8.0, 2018, 2025, ["CHI", "ORL"], 0, 0, false, 83, "big-scorer"],
  ["De'Andre Hunter", "SF", 2019, 1, 4, "USA", 13.5, 1.6, 3.9, 2019, 2025, ["ATL", "CLE"], 0, 0, false, 80, "wing-scorer"],
  ["Coby White", "PG", 2019, 1, 7, "USA", 15.3, 4.0, 3.4, 2019, 2025, ["CHI"], 0, 0, false, 76, "guard-scorer"],
  ["Rui Hachimura", "PF", 2019, 1, 9, "Japan", 12.5, 1.1, 4.3, 2019, 2025, ["WAS", "LAL"], 0, 1, false, 80, "big-scorer"],
  ["Darius Garland", "PG", 2019, 1, 5, "USA", 17.8, 6.7, 2.7, 2019, 2025, ["CLE"], 2, 0, false, 73, "guard-scorer"],
  ["P.J. Washington", "PF", 2019, 1, 12, "USA", 12.6, 2.0, 5.9, 2019, 2025, ["CHA", "DAL"], 0, 0, false, 79, "big-scorer"],
];
RAW.push(...MODERN_STARTERS_MORE);

const NINETIES_INTL_AND_MORE = [
  ["Sarunas Marciulionis", "SG", 1987, 6, 4, "Lithuania", 12.8, 3.0, 2.4, 1989, 1997, ["GSW", "SEA", "SAC", "DEN"], 0, 0, true, 75, "guard-scorer"],
  ["Rony Seikaly", "C", 1988, 1, 9, "Greece", 14.7, 1.3, 9.5, 1988, 1999, ["MIA", "GSW", "ORL", "NJN"], 0, 0, false, 83, "big-scorer"],
  ["Zydrunas Ilgauskas", "C", 1996, 1, 20, "Lithuania", 13.0, 1.1, 7.8, 1997, 2011, ["CLE", "MIA"], 2, 0, false, 87, "big-scorer"],
];
RAW.push(...NINETIES_INTL_AND_MORE);

const DEEP_CUT_ROLE_PLAYERS = [
  ["Brandon Bass", "PF", 2005, 2, 33, "USA", 9.1, 1.1, 4.8, 2005, 2017, ["NOH", "DAL", "ORL", "BOS", "LAC", "PHX"], 0, 0, false, 80, "big-scorer"],
  ["Glen Davis", "PF", 2007, 2, 35, "USA", 9.5, 1.4, 4.7, 2007, 2015, ["BOS", "ORL", "LAC"], 0, 1, false, 79, "big-scorer"],
  ["Jason Maxiell", "PF", 2005, 1, 26, "USA", 6.9, 0.5, 4.5, 2005, 2014, ["DET", "ORL", "CHA"], 0, 0, false, 79, "big-defender"],
  ["Amir Johnson", "PF", 2005, 2, 56, "USA", 6.7, 1.1, 5.2, 2005, 2019, ["DET", "TOR", "BOS", "PHI"], 0, 0, false, 81, "big-defender"],
  ["Kris Humphries", "PF", 2004, 1, 14, "USA", 8.5, 0.9, 6.1, 2004, 2016, ["UTA", "TOR", "DAL", "NJN", "BOS", "WAS", "ATL", "PHX"], 1, 0, false, 81, "big-scorer"],
  ["Marreese Speights", "C", 2008, 1, 16, "USA", 9.1, 0.9, 4.4, 2008, 2018, ["PHI", "MEM", "CLE", "GSW", "ORL"], 0, 1, false, 82, "big-scorer"],
  ["Ed Davis", "PF", 2010, 1, 13, "USA", 6.4, 0.6, 6.0, 2010, 2021, ["TOR", "MEM", "LAL", "POR", "UTA", "BKN", "MIN"], 0, 0, false, 82, "big-defender"],
  ["Jared Dudley", "SF", 2007, 2, 22, "USA", 7.7, 1.7, 3.3, 2007, 2021, ["CHA", "PHX", "LAC", "MIL", "WAS", "BKN", "LAL"], 0, 0, false, 78, "wing-defender"],
  ["James Johnson", "PF", 2009, 1, 16, "USA", 7.7, 1.7, 3.3, 2009, 2022, ["CHI", "TOR", "SAC", "MEM", "MIA"], 0, 0, false, 80, "big-defender"],
  ["Quincy Pondexter", "SF", 2010, 1, 26, "USA", 6.3, 1.0, 2.6, 2010, 2018, ["NOH", "MEM", "NOP"], 0, 0, false, 78, "wing-scorer"],
  ["James Ennis", "SF", 2013, 0, 0, "USA", 7.0, 1.0, 3.2, 2014, 2021, ["MIA", "MEM", "DET", "HOU", "PHI", "ORL"], 0, 0, false, 78, "wing-defender"],
  ["Gerald Green", "SG", 2005, 1, 18, "USA", 9.7, 1.0, 2.4, 2005, 2018, ["BOS", "MIN", "DAL", "NJN", "IND", "PHX", "MIA", "HOU"], 0, 0, false, 79, "guard-scorer"],
  ["Chris Andersen", "PF", 2001, 2, 49, "USA", 5.7, 0.4, 4.6, 2001, 2018, ["DEN", "MIA"], 0, 1, false, 82, "big-defender"],
  ["Ian Mahinmi", "C", 2005, 1, 28, "France", 5.6, 0.6, 4.3, 2007, 2019, ["SAS", "DAL", "IND", "WAS"], 0, 1, false, 83, "big-defender"],
  ["Andray Blatche", "PF", 2005, 2, 49, "USA", 12.5, 1.7, 6.2, 2005, 2016, ["WSB", "BKN"], 0, 0, false, 83, "big-scorer"],
  ["JaVale McGee", "C", 2008, 1, 18, "USA", 7.8, 0.5, 5.3, 2008, 2023, ["WAS", "DEN", "PHI", "DAL", "GSW", "LAL", "CLE", "PHX"], 0, 3, false, 84, "big-defender"],
  ["Tyson Chandler", "C", 2001, 1, 2, "USA", 8.2, 0.9, 8.8, 2001, 2020, ["CHI", "NOH", "CHA", "DAL", "NYK", "PHX", "LAL", "HOU"], 1, 1, false, 85, "big-defender"],
  ["Emeka Okafor", "C", 2004, 1, 2, "USA", 11.8, 0.7, 9.6, 2004, 2013, ["CHA", "NOH", "WAS"], 0, 0, false, 82, "big-defender"],
  ["Hassan Whiteside", "C", 2010, 2, 33, "USA", 11.5, 0.5, 9.8, 2013, 2022, ["MIA", "POR", "SAC", "UTA"], 0, 0, false, 83, "big-defender"],
];
RAW.push(...DEEP_CUT_ROLE_PLAYERS);

const NINETIES_ROLE_MORE = [
  ["Sam Cassell", "PG", 1993, 1, 24, "USA", 15.7, 6.0, 2.7, 1993, 2008, ["HOU", "PHI", "DAL", "MIL", "MIN", "LAC", "BOS"], 1, 2, false, 75, "guard-scorer"],
  ["Avery Johnson", "PG", 1988, 3, 12, "USA", 8.4, 5.5, 2.0, 1988, 2001, ["SEA", "SAS", "HOU", "GSW", "DEN", "DAL"], 0, 1, false, 71, "guard-defender"],
  ["Brian Grant", "PF", 1994, 1, 8, "USA", 12.7, 1.3, 8.0, 1994, 2006, ["SAC", "POR", "MIA", "LAL"], 0, 0, false, 82, "big-scorer"],
  ["P.J. Brown", "PF", 1992, 1, 29, "USA", 9.5, 1.4, 7.3, 1992, 2008, ["MIA", "CHH", "NOH", "BOS"], 0, 0, false, 82, "big-defender"],
  ["Isaac Austin", "C", 1993, 0, 0, "USA", 8.9, 1.0, 5.3, 1993, 2001, ["MIA", "LAC", "PHX", "MIN", "ORL"], 1, 0, false, 82, "big-scorer"],
  ["Charles Oakley", "PF", 1985, 1, 9, "USA", 9.6, 1.8, 9.5, 1985, 2004, ["CHI", "NYK", "TOR", "WAS", "HOU"], 1, 0, false, 81, "big-defender"],
  ["Vernon Maxwell", "SG", 1988, 2, 47, "USA", 13.0, 3.5, 2.6, 1988, 1999, ["SAS", "HOU", "PHI", "SEA", "IND", "GSW"], 0, 2, false, 75, "guard-scorer"],
  ["Kenny Smith", "PG", 1987, 1, 6, "USA", 9.4, 5.2, 2.2, 1987, 1997, ["SAC", "HOU", "ORL", "DEN"], 0, 2, false, 75, "guard-scorer"],
  ["Robert Pack", "PG", 1991, 2, 3, "USA", 10.0, 4.5, 2.1, 1991, 2004, ["POR", "DEN", "WSB", "DAL", "IND"], 0, 0, false, 73, "guard-scorer"],
  ["Doc Rivers", "PG", 1983, 2, 31, "USA", 10.9, 5.7, 3.1, 1983, 1996, ["ATL", "LAC", "NYK", "SAS"], 1, 0, false, 76, "guard-scorer"],
];
RAW.push(...NINETIES_ROLE_MORE);

const MORE_2010S_2020S = [
  ["Malcolm Brogdon", "SG", 2016, 2, 36, "USA", 14.4, 4.4, 3.8, 2016, 2024, ["MIL", "IND", "POR", "WAS"], 0, 1, false, 77, "guard-scorer"],
  ["Norman Powell", "SG", 2015, 2, 46, "USA", 13.0, 1.7, 2.9, 2015, 2025, ["TOR", "POR", "LAC", "MIA"], 0, 1, false, 76, "guard-scorer"],
  ["Caris LeVert", "SG", 2016, 1, 20, "USA", 14.9, 4.0, 3.3, 2016, 2025, ["BKN", "IND", "CLE", "ATL"], 0, 0, false, 78, "guard-scorer"],
  ["Josh Richardson", "SG", 2015, 2, 40, "USA", 11.4, 2.9, 3.1, 2015, 2025, ["MIA", "PHI", "DAL", "BOS", "SAS", "OKC"], 0, 0, false, 78, "guard-defender"],
  ["Malik Beasley", "SG", 2016, 1, 19, "USA", 11.9, 1.6, 3.1, 2016, 2025, ["DEN", "MIN", "UTA", "MIL", "DET"], 0, 0, false, 77, "guard-scorer"],
  ["Buddy Hield", "SG", 2016, 1, 6, "USA", 14.9, 2.4, 3.9, 2016, 2025, ["NOP", "SAC", "IND", "PHI", "GSW"], 0, 0, false, 76, "guard-scorer"],
  ["Terry Rozier", "PG", 2015, 1, 16, "USA", 13.9, 4.1, 3.6, 2015, 2025, ["BOS", "CHA", "MIA"], 0, 0, false, 74, "guard-scorer"],
  ["D'Angelo Russell", "PG", 2015, 1, 2, "USA", 16.9, 5.8, 3.1, 2015, 2025, ["LAL", "BKN", "GSW", "MIN"], 1, 0, false, 75, "guard-scorer"],
  ["Collin Sexton", "PG", 2018, 1, 8, "USA", 17.2, 3.0, 2.9, 2018, 2025, ["CLE", "UTA"], 0, 0, false, 74, "guard-scorer"],
  ["Jordan Clarkson", "SG", 2014, 2, 46, "USA", 15.5, 3.3, 3.1, 2014, 2025, ["LAL", "CLE", "UTA"], 0, 0, false, 76, "guard-scorer"],
  ["Kelly Oubre Jr.", "SF", 2015, 1, 15, "USA", 13.6, 1.6, 4.9, 2015, 2025, ["WAS", "PHX", "GSW", "CHA", "PHI"], 0, 0, false, 79, "wing-scorer"],
  ["Michael Porter Jr.", "SF", 2018, 1, 14, "USA", 15.6, 1.2, 6.7, 2018, 2025, ["DEN", "BKN"], 0, 1, false, 82, "wing-scorer"],
  ["Talen Horton-Tucker", "SG", 2019, 0, 0, "USA", 9.4, 2.8, 3.1, 2019, 2025, ["LAL", "UTA"], 0, 0, false, 76, "guard-scorer"],
  ["Killian Hayes", "PG", 2020, 1, 7, "USA", 6.9, 4.0, 2.8, 2020, 2024, ["DET", "IND"], 0, 0, false, 77, "guard-defender"],
  ["Isaac Okoro", "SF", 2020, 1, 5, "USA", 8.5, 1.4, 2.9, 2020, 2025, ["CLE"], 0, 0, false, 78, "wing-defender"],
  ["Deni Avdija", "SF", 2020, 1, 9, "Israel", 12.8, 3.0, 6.0, 2020, 2025, ["WAS", "POR"], 0, 0, false, 81, "wing-scorer"],
  ["Precious Achiuwa", "PF", 2020, 1, 20, "Nigeria", 8.5, 1.3, 6.2, 2020, 2025, ["MIA", "TOR", "NYK"], 0, 0, false, 81, "big-defender"],
  ["Josh Giddey", "PG", 2021, 1, 6, "Australia", 12.9, 6.0, 6.9, 2021, 2025, ["OKC", "CHI"], 0, 0, false, 80, "guard-scorer"],
  ["Herbert Jones", "SF", 2021, 2, 35, "USA", 10.6, 2.1, 3.9, 2021, 2025, ["NOP"], 0, 0, false, 79, "wing-defender"],
  ["Alperen Sengun", "C", 2021, 1, 16, "Turkey", 15.6, 4.5, 8.6, 2021, 2025, ["HOU"], 1, 0, false, 81, "big-scorer"],
];
RAW.push(...MORE_2010S_2020S);

const FINAL_DEPTH_BATCH = [
  ["Metta World Peace", "SF", 1999, 1, 16, "USA", 13.1, 2.4, 4.6, 1999, 2017, ["CHI", "IND", "SAC", "HOU", "LAL", "NYK"], 1, 1, false, 79, "wing-defender"],
  ["Jamaal Tinsley", "PG", 2001, 1, 27, "USA", 11.5, 6.6, 2.6, 2001, 2012, ["IND", "MEM", "UTA", "LAL"], 0, 0, false, 75, "guard-scorer"],
  ["Speedy Claxton", "PG", 2000, 1, 20, "USA", 8.4, 4.6, 2.2, 2000, 2008, ["PHI", "SAS", "GSW", "ATL"], 0, 1, false, 71, "guard-defender"],
  ["Earl Boykins", "PG", 1998, 0, 0, "USA", 8.9, 3.1, 1.4, 1998, 2012, ["NJN", "CLE", "GSW", "DEN", "MIL", "HOU", "WAS"], 0, 0, false, 65, "guard-scorer"],
  ["Damon Stoudamire", "PG", 1995, 1, 7, "USA", 13.4, 6.2, 2.7, 1995, 2008, ["TOR", "POR", "MEM"], 1, 0, false, 69, "guard-scorer"],
  ["Bonzi Wells", "SG", 1998, 1, 11, "USA", 12.9, 2.6, 4.3, 1998, 2009, ["POR", "MEM", "SAC", "NOH", "HOU"], 0, 0, false, 77, "wing-scorer"],
  ["Jerry Stackhouse", "SG", 1995, 1, 3, "USA", 16.9, 3.1, 3.3, 1995, 2013, ["PHI", "DET", "WAS", "DAL", "MIA", "ATL", "BKN"], 2, 0, false, 78, "guard-scorer"],
  ["Antonio McDyess", "PF", 1995, 1, 2, "USA", 14.4, 1.1, 8.0, 1995, 2011, ["LAC", "DEN", "NYK", "PHX", "DET", "SAS"], 2, 0, false, 82, "big-scorer"],
  ["Jalen Rose", "SG", 1994, 1, 13, "USA", 14.3, 3.9, 3.6, 1994, 2007, ["DEN", "IND", "CHI", "TOR", "NYK", "PHX"], 1, 0, false, 79, "wing-scorer"],
  ["Steve Francis", "PG", 1999, 1, 2, "USA", 18.7, 5.4, 4.6, 1999, 2007, ["HOU", "ORL", "NYK"], 3, 0, false, 74, "guard-scorer"],
  ["Cuttino Mobley", "SG", 1998, 2, 41, "USA", 15.4, 2.6, 3.1, 1998, 2008, ["HOU", "ORL", "LAC", "NYK"], 0, 0, false, 77, "guard-scorer"],
  ["Matt Harpring", "SF", 1998, 1, 15, "USA", 13.2, 1.9, 4.7, 1998, 2009, ["ORL", "PHI", "UTA"], 0, 0, false, 79, "wing-scorer"],
  ["Wally Szczerbiak", "SF", 1999, 1, 6, "USA", 14.4, 1.7, 4.1, 1999, 2010, ["MIN", "BOS", "SEA", "CLE"], 1, 0, false, 79, "wing-scorer"],
  ["Antonio Daniels", "PG", 1997, 1, 4, "USA", 7.3, 4.0, 2.4, 1997, 2010, ["VAN", "SAS", "SEA", "POR", "WAS", "MIN"], 0, 0, false, 76, "guard-scorer"],
  ["Bobby Simmons", "SF", 2001, 2, 42, "USA", 8.9, 1.6, 3.9, 2001, 2010, ["SEA", "LAC", "MIL", "NJN"], 0, 0, false, 79, "wing-defender"],
  ["Keith Van Horn", "PF", 1997, 1, 2, "USA", 16.5, 2.2, 6.6, 1997, 2006, ["NJN", "PHI", "MIL", "DAL"], 1, 0, false, 82, "big-scorer"],
  ["Eddie House", "PG", 2000, 2, 37, "USA", 8.5, 1.8, 1.5, 2000, 2011, ["MIA", "PHX", "NOH", "SAC", "BOS", "LAC"], 0, 1, false, 74, "guard-scorer"],
  ["Voshon Lenard", "SG", 1994, 0, 0, "USA", 11.1, 2.0, 2.2, 1994, 2007, ["MIA", "DEN", "MIN", "WAS"], 0, 0, false, 77, "guard-scorer"],
  ["Jamario Moon", "SF", 2007, 0, 0, "USA", 5.8, 0.9, 4.5, 2007, 2012, ["TOR", "MIA", "CLE", "LAL"], 0, 0, false, 79, "wing-defender"],
  ["Devean George", "SF", 1999, 1, 23, "USA", 6.0, 1.1, 3.6, 1999, 2011, ["LAL", "DAL", "GSW", "NYK"], 0, 3, false, 79, "wing-defender"],
  ["Luke Walton", "SF", 2003, 1, 32, "USA", 4.7, 2.2, 3.0, 2003, 2012, ["LAL"], 0, 2, false, 80, "wing-scorer"],
  ["Sasha Vujacic", "SG", 2004, 1, 27, "Slovenia", 5.5, 1.1, 1.4, 2004, 2013, ["LAL", "NJN"], 0, 2, false, 79, "guard-scorer"],
  ["Jordan Farmar", "PG", 2006, 1, 26, "USA", 7.0, 3.0, 1.9, 2006, 2015, ["LAL", "NJN", "MEM"], 0, 2, false, 74, "guard-scorer"],
  ["Shannon Brown", "SG", 2006, 1, 25, "USA", 7.9, 1.6, 2.0, 2006, 2014, ["CLE", "CHI", "CHA", "LAL", "PHX"], 0, 1, false, 76, "guard-scorer"],
  ["Von Wafer", "SG", 2005, 2, 39, "USA", 6.7, 1.1, 1.7, 2005, 2011, ["LAL", "POR", "HOU", "ORL", "MIL"], 0, 0, false, 77, "guard-scorer"],
  ["Beno Udrih", "PG", 2004, 2, 28, "Slovenia", 9.5, 3.9, 1.9, 2004, 2016, ["SAS", "SAC", "MIL", "ORL", "MEM", "NYK", "DET"], 0, 1, false, 75, "guard-scorer"],
  ["Kirk Hinrich", "PG", 2003, 1, 7, "USA", 11.6, 4.3, 2.9, 2003, 2016, ["CHI", "ATL", "WAS"], 0, 0, false, 76, "guard-defender"],
  ["Ben Gordon", "SG", 2004, 1, 3, "USA", 15.1, 2.4, 2.1, 2004, 2015, ["CHI", "DET", "CHA", "ORL"], 1, 0, false, 75, "guard-scorer"],
  ["Andres Nocioni", "PF", 2004, 2, 39, "Argentina", 10.6, 1.5, 4.7, 2004, 2012, ["CHI", "SAC", "PHI"], 0, 0, false, 80, "big-scorer"],
  ["Chris Duhon", "PG", 2004, 0, 0, "USA", 6.8, 4.6, 2.6, 2004, 2012, ["CHI", "NYK", "ORL", "LAC"], 0, 0, false, 74, "guard-scorer"],
  ["Tyrus Thomas", "PF", 2006, 1, 4, "USA", 8.5, 0.8, 5.3, 2006, 2014, ["CHI", "CHA"], 0, 0, false, 81, "big-defender"],
  ["Thabo Sefolosha", "SG", 2006, 1, 13, "Switzerland", 6.2, 1.6, 3.3, 2006, 2020, ["CHI", "OKC", "ATL", "UTA"], 0, 0, false, 79, "wing-defender"],
  ["Deron Williams", "PG", 2005, 1, 3, "USA", 16.3, 8.1, 3.2, 2005, 2017, ["UTA", "NJN", "BKN", "DAL", "CLE"], 3, 0, false, 75, "guard-scorer"],
  ["Mehmet Okur", "C", 2001, 2, 38, "Turkey", 13.5, 1.6, 6.8, 2002, 2012, ["DET", "UTA"], 1, 1, false, 82, "big-scorer"],
  ["Carlos Boozer", "PF", 2002, 2, 34, "USA", 16.2, 2.0, 9.5, 2002, 2016, ["CLE", "UTA", "CHI", "LAL"], 2, 0, false, 81, "big-scorer"],
  ["Raymond Felton", "PG", 2005, 1, 5, "USA", 11.5, 5.6, 3.1, 2005, 2018, ["CHA", "DEN", "POR", "NYK", "DAL", "LAC", "OKC"], 0, 0, false, 73, "guard-scorer"],
  ["D.J. Augustin", "PG", 2008, 1, 9, "USA", 10.0, 4.0, 2.1, 2008, 2020, ["CHA", "IND", "TOR", "CHI", "DEN", "OKC", "ORL"], 0, 0, false, 71, "guard-scorer"],
  ["Jeff Teague", "PG", 2009, 1, 19, "USA", 12.6, 5.9, 2.7, 2009, 2021, ["ATL", "IND", "MIN", "BOS", "MIL"], 1, 0, false, 74, "guard-scorer"],
  ["George Hill", "PG", 2008, 1, 26, "USA", 10.3, 3.3, 2.6, 2008, 2022, ["SAS", "IND", "UTA", "SAC", "CLE", "MIL"], 0, 0, false, 75, "guard-defender"],
  ["Aaron Brooks", "PG", 2007, 1, 26, "USA", 9.9, 3.4, 1.9, 2007, 2018, ["HOU", "PHX", "SAC", "DEN", "CHI", "IND", "MIN"], 0, 0, false, 71, "guard-scorer"],
  ["Goran Dragic", "PG", 2008, 2, 45, "Slovenia", 13.9, 4.4, 3.0, 2008, 2023, ["PHX", "HOU", "MIA", "TOR", "CHI", "MIL"], 1, 0, false, 75, "guard-scorer"],
  ["Ricky Rubio", "PG", 2009, 1, 5, "Spain", 9.7, 6.9, 3.9, 2011, 2022, ["MIN", "UTA", "PHX", "CLE"], 0, 0, false, 76, "guard-defender"],
  ["Nikola Peković", "C", 2008, 2, 31, "Montenegro", 12.4, 1.0, 6.6, 2010, 2016, ["MIN"], 0, 0, false, 83, "big-scorer"],
  ["Greivis Vasquez", "PG", 2010, 2, 28, "Venezuela", 9.6, 4.6, 3.0, 2010, 2016, ["MEM", "NOH", "SAC", "TOR", "MIL", "BKN"], 0, 0, false, 77, "guard-scorer"],
  ["Kosta Koufos", "C", 2008, 1, 23, "USA", 6.7, 0.6, 5.4, 2008, 2018, ["UTA", "MIN", "DEN", "MEM", "SAC"], 0, 0, false, 84, "big-defender"],
  ["Omer Asik", "C", 2008, 2, 36, "Turkey", 5.6, 0.6, 6.6, 2010, 2018, ["CHI", "HOU", "NOP"], 0, 0, false, 83, "big-defender"],
  ["Marcin Gortat", "C", 2005, 1, 57, "Poland", 9.9, 1.1, 7.8, 2007, 2018, ["ORL", "PHX", "WAS", "LAC"], 1, 0, false, 83, "big-scorer"],
  ["Spencer Hawes", "C", 2007, 1, 10, "USA", 9.4, 2.2, 5.7, 2007, 2017, ["SAC", "PHI", "CLE", "LAC", "CHA", "MIL"], 0, 0, false, 84, "big-scorer"],
  ["Robin Lopez", "C", 2008, 1, 15, "USA", 7.5, 0.6, 4.5, 2008, 2022, ["PHX", "NOH", "POR", "NYK", "CHI", "MIL", "WAS", "ORL", "CLE"], 0, 0, false, 84, "big-defender"],
  ["Brook Lopez", "C", 2008, 1, 10, "USA", 16.6, 1.2, 6.5, 2008, 2025, ["NJN", "BKN", "LAL", "MIL"], 2, 1, false, 84, "big-scorer"],
  ["Channing Frye", "C", 2005, 1, 8, "USA", 9.4, 1.1, 4.2, 2005, 2019, ["NYK", "POR", "PHX", "ORL", "CLE", "LAL"], 0, 1, false, 83, "big-scorer"],
  ["JJ Redick", "SG", 2006, 1, 11, "USA", 12.8, 1.9, 1.8, 2006, 2021, ["ORL", "MIL", "LAC", "PHI", "NOP", "DAL"], 0, 0, false, 76, "guard-scorer"],
  ["Kyle Anderson", "SF", 2014, 1, 30, "USA", 8.1, 3.1, 4.9, 2014, 2025, ["SAS", "MEM", "MIN"], 0, 0, false, 81, "wing-defender"],
  ["Royce O'Neale", "SF", 2015, 0, 0, "USA", 7.9, 2.0, 4.1, 2018, 2025, ["UTA", "BKN", "PHX"], 0, 0, false, 78, "wing-defender"],
  ["Grant Williams", "PF", 2019, 1, 22, "USA", 7.4, 1.4, 3.8, 2019, 2025, ["BOS", "DAL", "CHA"], 0, 0, false, 79, "big-defender"],
  ["Naz Reid", "C", 2019, 0, 0, "USA", 11.2, 1.5, 5.2, 2019, 2025, ["MIN"], 0, 0, false, 82, "big-scorer"],
];
RAW.push(...FINAL_DEPTH_BATCH);

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const players = RAW.map((row) => {
  const [
    name, position, draft_year, draft_round, draft_pick, birth_country,
    career_ppg, career_apg, career_rpg, years_active_start, years_active_end,
    teams, all_star_appearances, championships, is_hall_of_fame, height_inches, archetype_tag,
  ] = row;
  return {
    player_id: slugify(name),
    name,
    position,
    draft_year: draft_round === 0 ? null : draft_year,
    draft_round: draft_round === 0 ? null : draft_round,
    draft_pick: draft_round === 0 ? null : draft_pick,
    birth_country,
    career_ppg,
    career_apg,
    career_rpg,
    years_active_start,
    years_active_end,
    teams,
    all_star_appearances,
    championships,
    is_hall_of_fame,
    height_inches,
    archetype_tag,
  };
});

const seen = new Set();
const deduped = players.filter((p) => {
  if (seen.has(p.player_id)) return false;
  seen.add(p.player_id);
  return true;
});

const json = JSON.stringify(deduped, null, 2) + "\n";
const targets = [
  path.resolve(__dirname, "../src/data/nba_players.json"),
  path.resolve(__dirname, "../../../apps/web/src/data/nba_players.json"),
];
for (const target of targets) {
  fs.writeFileSync(target, json);
  console.log("wrote", deduped.length, "players to", target);
}
