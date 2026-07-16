// Generates apps/web/src/data/nba_player_seasons.json — season-by-season PPG
// for well-known players, organized by the FRANCHISE they played for (using
// the franchise's current team name/abbreviation even for seasons played
// before a relocation, e.g. Seattle SuperSonics seasons appear under OKC).
//
// This is a one-off content-generation script, not part of the app build.
// Run with: node apps/web/scripts/generate-player-seasons.mjs
//
// Best-effort season averages from training knowledge, not scraped/verified
// against a live stats API — see the note in services/api about the missing
// "team roster history" endpoint this would ideally be replaced with.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// [name, player_id, position, [[season, ppg], ...]]
const TEAMS = {
  ATL: {
    team_name: "Atlanta Hawks",
    players: [
      ["Trae Young", "trae_young", "PG", [["2018-19", 19.1], ["2019-20", 29.6], ["2020-21", 25.3], ["2021-22", 28.4], ["2022-23", 26.2], ["2023-24", 25.7], ["2024-25", 24.2]]],
      ["Dominique Wilkins", "dominique_wilkins", "SF", [["1982-83", 17.0], ["1985-86", 26.6], ["1986-87", 29.0], ["1987-88", 30.7], ["1990-91", 25.9], ["1991-92", 29.0], ["1993-94", 24.4]]],
      ["Bob Pettit", "bob_pettit", "PF", [["1955-56", 20.4], ["1958-59", 29.2], ["1959-60", 26.1], ["1961-62", 31.1], ["1962-63", 28.4]]],
      ["Dikembe Mutombo", "dikembe_mutombo_atl", "C", [["1996-97", 13.3], ["1997-98", 13.4], ["1999-2000", 11.6], ["2000-01", 9.5]]],
      ["Joe Johnson", "joe_johnson", "SG", [["2005-06", 20.7], ["2006-07", 25.0], ["2007-08", 21.7], ["2009-10", 21.3], ["2010-11", 18.6]]],
      ["Al Horford", "al_horford_atl", "PF", [["2007-08", 10.1], ["2009-10", 14.2], ["2012-13", 17.4], ["2013-14", 18.6], ["2014-15", 15.2]]],
      ["Lou Hudson", "lou_hudson", "SG", [["1969-70", 25.4], ["1970-71", 26.8], ["1972-73", 27.1], ["1973-74", 23.9]]],
      ["Spud Webb", "spud_webb", "PG", [["1986-87", 8.8], ["1987-88", 11.8], ["1988-89", 12.7], ["1990-91", 13.1]]],
    ],
  },
  BOS: {
    team_name: "Boston Celtics",
    players: [
      ["Jayson Tatum", "jayson_tatum", "SF", [["2018-19", 15.7], ["2019-20", 23.4], ["2020-21", 26.4], ["2021-22", 26.9], ["2022-23", 30.1], ["2023-24", 26.9]]],
      ["Larry Bird", "larry_bird", "SF", [["1979-80", 21.3], ["1983-84", 24.2], ["1984-85", 28.7], ["1985-86", 25.8], ["1987-88", 29.9]]],
      ["Paul Pierce", "paul_pierce", "SF", [["1999-2000", 19.5], ["2001-02", 26.1], ["2005-06", 26.8], ["2007-08", 19.6], ["2008-09", 20.8]]],
      ["Kevin Garnett", "kevin_garnett_bos", "PF", [["2007-08", 18.8], ["2008-09", 15.8], ["2010-11", 14.9], ["2011-12", 15.8]]],
      ["Bill Russell", "bill_russell_bos", "C", [["1958-59", 16.7], ["1961-62", 18.9], ["1963-64", 15.0], ["1964-65", 14.1]]],
      ["John Havlicek", "john_havlicek", "SF", [["1970-71", 28.9], ["1971-72", 27.5], ["1972-73", 23.8], ["1973-74", 22.6]]],
      ["Kevin McHale", "kevin_mchale", "PF", [["1986-87", 26.1], ["1987-88", 22.6], ["1988-89", 22.5]]],
      ["Jaylen Brown", "jaylen_brown", "SG", [["2018-19", 13.0], ["2020-21", 24.7], ["2021-22", 23.6], ["2022-23", 26.6], ["2023-24", 23.0]]],
      ["Bob Cousy", "bob_cousy_bos", "PG", [["1957-58", 20.0], ["1959-60", 19.4]]],
    ],
  },
  BKN: {
    team_name: "Brooklyn Nets",
    players: [
      ["Jason Kidd", "jason_kidd_nets", "PG", [["2001-02", 14.7], ["2002-03", 18.7], ["2003-04", 18.7], ["2005-06", 13.4]]],
      ["Vince Carter", "vince_carter_nets", "SG", [["2004-05", 27.5], ["2005-06", 24.2], ["2006-07", 25.2], ["2007-08", 21.3]]],
      ["Kyrie Irving", "kyrie_irving_bkn", "PG", [["2019-20", 27.4], ["2020-21", 26.9], ["2021-22", 27.4]]],
      ["Kevin Durant", "kevin_durant_bkn", "SF", [["2021-22", 29.9], ["2022-23", 29.7]]],
      ["Julius Erving", "julius_erving_nets", "SF", [["1973-74", 27.4], ["1974-75", 27.9], ["1975-76", 29.3]]],
      ["Drazen Petrovic", "drazen_petrovic", "SG", [["1991-92", 20.6], ["1992-93", 22.3]]],
      ["Mikal Bridges", "mikal_bridges_bkn", "SF", [["2023-24", 19.6], ["2024-25", 17.6]]],
      ["Buck Williams", "buck_williams_nets", "PF", [["1985-86", 12.8], ["1988-89", 13.6]]],
      ["Brook Lopez", "brook_lopez_nets", "C", [["2010-11", 20.4], ["2012-13", 19.4]]],
    ],
  },
  CHA: {
    team_name: "Charlotte Hornets",
    players: [
      ["LaMelo Ball", "lamelo_ball", "PG", [["2020-21", 15.7], ["2021-22", 20.1], ["2022-23", 23.3], ["2023-24", 23.9]]],
      ["Kemba Walker", "kemba_walker_cha", "PG", [["2014-15", 17.3], ["2016-17", 23.2], ["2017-18", 22.1], ["2018-19", 25.6]]],
      ["Dell Curry", "dell_curry", "SG", [["1990-91", 16.3], ["1993-94", 16.3], ["1994-95", 14.6]]],
      ["Larry Johnson", "larry_johnson", "PF", [["1991-92", 19.2], ["1992-93", 22.1], ["1993-94", 16.4]]],
      ["Glen Rice", "glen_rice_cha", "SF", [["1995-96", 21.6], ["1996-97", 26.8]]],
      ["Alonzo Mourning", "alonzo_mourning_cha", "C", [["1993-94", 21.5], ["1994-95", 21.3]]],
      ["Gerald Wallace", "gerald_wallace", "SF", [["2005-06", 15.2], ["2009-10", 18.2]]],
      ["Baron Davis", "baron_davis_cha", "PG", [["1999-2000", 13.7], ["2000-01", 18.4]]],
    ],
  },
  CHI: {
    team_name: "Chicago Bulls",
    players: [
      ["Michael Jordan", "michael_jordan", "SG", [["1986-87", 37.1], ["1987-88", 35.0], ["1989-90", 33.6], ["1990-91", 31.5], ["1991-92", 30.1], ["1995-96", 30.4], ["1996-97", 29.6]]],
      ["Scottie Pippen", "scottie_pippen_chi", "SF", [["1991-92", 21.0], ["1993-94", 22.0], ["1995-96", 19.4]]],
      ["Derrick Rose", "derrick_rose", "PG", [["2008-09", 16.8], ["2009-10", 20.8], ["2010-11", 25.0], ["2011-12", 21.8]]],
      ["Zach LaVine", "zach_lavine", "SG", [["2018-19", 23.7], ["2019-20", 25.5], ["2020-21", 27.4], ["2021-22", 24.4]]],
      ["DeMar DeRozan", "demar_derozan_chi", "SF", [["2022-23", 24.5], ["2023-24", 24.0]]],
      ["Dennis Rodman", "dennis_rodman_chi", "PF", [["1995-96", 5.5], ["1996-97", 5.7]]],
      ["Joakim Noah", "joakim_noah", "C", [["2013-14", 12.6], ["2014-15", 9.4]]],
      ["Luol Deng", "luol_deng_chi", "SF", [["2006-07", 18.8], ["2011-12", 15.3]]],
    ],
  },
  CLE: {
    team_name: "Cleveland Cavaliers",
    players: [
      ["LeBron James", "lebron_james_cle", "SF", [["2003-04", 20.9], ["2005-06", 31.4], ["2006-07", 27.3], ["2008-09", 28.4], ["2009-10", 29.7], ["2014-15", 25.3], ["2015-16", 25.3], ["2017-18", 27.5]]],
      ["Kyrie Irving", "kyrie_irving_cle", "PG", [["2011-12", 18.5], ["2013-14", 20.8], ["2014-15", 21.7], ["2015-16", 19.6]]],
      ["Mark Price", "mark_price", "PG", [["1988-89", 18.9], ["1991-92", 18.1], ["1992-93", 15.7]]],
      ["Brad Daugherty", "brad_daugherty", "C", [["1988-89", 18.7], ["1989-90", 21.6], ["1991-92", 19.7]]],
      ["Kevin Love", "kevin_love_cle", "PF", [["2014-15", 16.4], ["2016-17", 19.0]]],
      ["Donovan Mitchell", "donovan_mitchell_cle", "SG", [["2023-24", 26.6], ["2024-25", 24.0]]],
      ["Zydrunas Ilgauskas", "zydrunas_ilgauskas", "C", [["2002-03", 16.9], ["2005-06", 15.7]]],
      ["World B. Free", "world_b_free", "SG", [["1982-83", 23.4], ["1983-84", 22.5]]],
    ],
  },
  DAL: {
    team_name: "Dallas Mavericks",
    players: [
      ["Luka Doncic", "luka_doncic_dal", "PG", [["2018-19", 21.2], ["2019-20", 28.8], ["2020-21", 27.7], ["2021-22", 28.4], ["2022-23", 32.4], ["2023-24", 33.9]]],
      ["Dirk Nowitzki", "dirk_nowitzki", "PF", [["2001-02", 23.4], ["2005-06", 26.6], ["2006-07", 24.6], ["2010-11", 23.0], ["2013-14", 21.7]]],
      ["Jason Kidd", "jason_kidd_dal", "PG", [["1996-97", 11.7], ["1999-2000", 14.3]]],
      ["Rolando Blackman", "rolando_blackman", "SG", [["1985-86", 19.2], ["1987-88", 19.4]]],
      ["Mark Aguirre", "mark_aguirre", "SF", [["1983-84", 29.5], ["1984-85", 25.7]]],
      ["Steve Nash", "steve_nash_dal", "PG", [["1998-99", 7.9], ["2001-02", 17.9]]],
      ["Michael Finley", "michael_finley", "SG", [["1998-99", 22.6], ["2001-02", 21.7]]],
      ["Tyson Chandler", "tyson_chandler_dal", "C", [["2010-11", 10.1]]],
    ],
  },
  DEN: {
    team_name: "Denver Nuggets",
    players: [
      ["Nikola Jokic", "nikola_jokic", "C", [["2018-19", 20.1], ["2019-20", 19.9], ["2020-21", 26.4], ["2021-22", 27.1], ["2022-23", 24.5], ["2023-24", 26.4]]],
      ["Carmelo Anthony", "carmelo_anthony_den", "SF", [["2004-05", 20.8], ["2006-07", 28.9], ["2008-09", 22.8], ["2009-10", 28.2]]],
      ["Alex English", "alex_english_den", "SF", [["1981-82", 25.4], ["1982-83", 25.9], ["1985-86", 29.8]]],
      ["David Thompson", "david_thompson", "SG", [["1977-78", 27.2], ["1978-79", 24.0]]],
      ["Jamal Murray", "jamal_murray", "PG", [["2018-19", 18.2], ["2019-20", 18.5]]],
      ["Fat Lever", "fat_lever", "PG", [["1986-87", 18.0], ["1989-90", 19.8]]],
      ["Dan Issel", "dan_issel_den", "C", [["1975-76", 25.1], ["1977-78", 20.3]]],
      ["Antonio McDyess", "antonio_mcdyess_den", "PF", [["1998-99", 15.5], ["2000-01", 20.8]]],
    ],
  },
  DET: {
    team_name: "Detroit Pistons",
    players: [
      ["Isiah Thomas", "isiah_thomas", "PG", [["1983-84", 21.3], ["1984-85", 21.2], ["1985-86", 20.9], ["1989-90", 18.2]]],
      ["Grant Hill", "grant_hill_det", "SF", [["1994-95", 19.9], ["1996-97", 21.4], ["1999-2000", 25.8]]],
      ["Ben Wallace", "ben_wallace_det", "C", [["2001-02", 7.8], ["2002-03", 6.9]]],
      ["Chauncey Billups", "chauncey_billups_det", "PG", [["2003-04", 16.9], ["2005-06", 18.5], ["2006-07", 17.0]]],
      ["Joe Dumars", "joe_dumars", "SG", [["1989-90", 17.8], ["1992-93", 23.5]]],
      ["Bob Lanier", "bob_lanier", "C", [["1971-72", 25.7], ["1973-74", 22.5]]],
      ["Dave Bing", "dave_bing", "PG", [["1967-68", 27.1], ["1970-71", 27.0]]],
      ["Cade Cunningham", "cade_cunningham", "PG", [["2022-23", 17.7], ["2023-24", 22.7]]],
      ["Rasheed Wallace", "rasheed_wallace_det", "PF", [["2004-05", 14.4], ["2005-06", 15.1]]],
    ],
  },
  GSW: {
    team_name: "Golden State Warriors",
    players: [
      ["Stephen Curry", "stephen_curry", "PG", [["2012-13", 22.9], ["2014-15", 23.8], ["2015-16", 30.1], ["2018-19", 27.3], ["2020-21", 32.0], ["2021-22", 25.5]]],
      ["Klay Thompson", "klay_thompson_gsw", "SG", [["2014-15", 21.7], ["2018-19", 21.5]]],
      ["Draymond Green", "draymond_green_gsw", "PF", [["2015-16", 14.0]]],
      ["Wilt Chamberlain", "wilt_chamberlain_sfw", "C", [["1959-60", 37.6], ["1961-62", 50.4], ["1962-63", 44.8]]],
      ["Rick Barry", "rick_barry_gsw", "SF", [["1966-67", 35.6], ["1974-75", 30.6]]],
      ["Chris Mullin", "chris_mullin", "SF", [["1988-89", 26.5], ["1990-91", 25.7]]],
      ["Baron Davis", "baron_davis_gsw", "PG", [["2007-08", 21.8]]],
      ["Kevin Durant", "kevin_durant_gsw", "SF", [["2016-17", 25.1], ["2017-18", 26.4], ["2018-19", 26.0]]],
    ],
  },
  HOU: {
    team_name: "Houston Rockets",
    players: [
      ["Hakeem Olajuwon", "hakeem_olajuwon", "C", [["1988-89", 24.8], ["1992-93", 26.1], ["1993-94", 27.3], ["1994-95", 27.8]]],
      ["James Harden", "james_harden_hou", "SG", [["2015-16", 29.0], ["2017-18", 30.4], ["2018-19", 36.1], ["2019-20", 34.3]]],
      ["Yao Ming", "yao_ming", "C", [["2005-06", 22.3], ["2006-07", 25.0], ["2008-09", 19.7]]],
      ["Moses Malone", "moses_malone_hou", "C", [["1978-79", 24.8], ["1980-81", 27.8]]],
      ["Calvin Murphy", "calvin_murphy", "PG", [["1977-78", 25.6], ["1978-79", 21.9]]],
      ["Tracy McGrady", "tracy_mcgrady_hou", "SG", [["2004-05", 25.7], ["2006-07", 24.6]]],
      ["Clyde Drexler", "clyde_drexler_hou", "SG", [["1995-96", 21.4], ["1996-97", 18.4]]],
      ["Alperen Sengun", "alperen_sengun", "C", [["2023-24", 21.1], ["2024-25", 19.1]]],
      ["Shane Battier", "shane_battier_hou", "SF", [["2006-07", 10.1]]],
      ["Otis Thorpe", "otis_thorpe_hou", "PF", [["1989-90", 15.7], ["1992-93", 14.8]]],
    ],
  },
  IND: {
    team_name: "Indiana Pacers",
    players: [
      ["Reggie Miller", "reggie_miller", "SG", [["1993-94", 19.9], ["1994-95", 20.6], ["1997-98", 18.5], ["1999-2000", 18.1]]],
      ["Tyrese Haliburton", "tyrese_haliburton_ind", "PG", [["2022-23", 20.7], ["2023-24", 20.1], ["2024-25", 18.6]]],
      ["Rik Smits", "rik_smits", "C", [["1992-93", 15.1], ["1994-95", 17.4]]],
      ["Jermaine O'Neal", "jermaine_oneal_ind", "PF", [["2003-04", 20.1], ["2004-05", 20.1]]],
      ["George McGinnis", "george_mcginnis", "PF", [["1974-75", 29.8], ["1975-76", 22.6]]],
      ["Paul George", "paul_george_ind", "SF", [["2013-14", 21.7], ["2015-16", 23.1], ["2016-17", 23.7]]],
      ["Danny Granger", "danny_granger", "SF", [["2008-09", 25.8], ["2009-10", 20.5]]],
      ["Victor Oladipo", "victor_oladipo", "SG", [["2017-18", 23.1], ["2018-19", 19.0]]],
    ],
  },
  LAC: {
    team_name: "LA Clippers",
    players: [
      ["Kawhi Leonard", "kawhi_leonard_lac", "SF", [["2019-20", 27.1], ["2022-23", 23.8], ["2023-24", 23.7]]],
      ["Chris Paul", "chris_paul_lac", "PG", [["2011-12", 19.8], ["2012-13", 16.9], ["2013-14", 19.1]]],
      ["Blake Griffin", "blake_griffin", "PF", [["2010-11", 22.5], ["2013-14", 24.1], ["2014-15", 21.9]]],
      ["Elton Brand", "elton_brand", "PF", [["2001-02", 20.9], ["2005-06", 24.7]]],
      ["Bob McAdoo", "bob_mcadoo_buf", "C", [["1976-77", 26.5]]],
      ["Danny Manning", "danny_manning_lac", "PF", [["1990-91", 19.3], ["1993-94", 23.6]]],
      ["DeAndre Jordan", "deandre_jordan", "C", [["2015-16", 12.7], ["2016-17", 12.0]]],
      ["James Harden", "james_harden_lac", "SG", [["2023-24", 16.6]]],
    ],
  },
  LAL: {
    team_name: "Los Angeles Lakers",
    players: [
      ["LeBron James", "lebron_james_lal", "SF", [["2018-19", 27.4], ["2019-20", 25.3], ["2020-21", 25.0], ["2021-22", 30.3], ["2022-23", 28.9], ["2023-24", 25.7]]],
      ["Kobe Bryant", "kobe_bryant", "SG", [["2002-03", 30.0], ["2005-06", 35.4], ["2006-07", 31.6], ["2008-09", 26.8], ["2012-13", 27.3]]],
      ["Magic Johnson", "magic_johnson", "PG", [["1986-87", 23.9], ["1988-89", 22.5], ["1990-91", 19.4]]],
      ["Kareem Abdul-Jabbar", "kareem_abduljabbar_lal", "C", [["1976-77", 26.2], ["1979-80", 24.8], ["1983-84", 21.5]]],
      ["Shaquille O'Neal", "shaquille_oneal_lal", "C", [["1999-2000", 29.7], ["2000-01", 28.7], ["2001-02", 27.2]]],
      ["Jerry West", "jerry_west", "SG", [["1965-66", 31.3], ["1969-70", 31.2]]],
      ["Elgin Baylor", "elgin_baylor", "SF", [["1961-62", 38.3], ["1962-63", 34.0]]],
      ["Anthony Davis", "anthony_davis_lal", "PF", [["2019-20", 26.1], ["2021-22", 23.2], ["2023-24", 24.7]]],
    ],
  },
  MEM: {
    team_name: "Memphis Grizzlies",
    players: [
      ["Ja Morant", "ja_morant", "PG", [["2019-20", 17.8], ["2020-21", 19.1], ["2021-22", 27.4], ["2022-23", 26.2]]],
      ["Marc Gasol", "marc_gasol_mem", "C", [["2012-13", 14.1], ["2014-15", 17.4], ["2016-17", 19.5]]],
      ["Mike Conley", "mike_conley_mem", "PG", [["2013-14", 17.2], ["2016-17", 20.5], ["2017-18", 12.5]]],
      ["Zach Randolph", "zach_randolph_mem", "PF", [["2010-11", 20.1], ["2012-13", 15.4]]],
      ["Shareef Abdur-Rahim", "shareef_abdurrahim", "PF", [["1998-99", 23.0], ["1999-2000", 20.3]]],
      ["Pau Gasol", "pau_gasol_mem", "PF", [["2004-05", 21.8], ["2006-07", 20.8]]],
      ["Rudy Gay", "rudy_gay_mem", "SF", [["2009-10", 19.6], ["2010-11", 19.8]]],
      ["O.J. Mayo", "oj_mayo_mem", "SG", [["2008-09", 18.5], ["2009-10", 17.5]]],
    ],
  },
  MIA: {
    team_name: "Miami Heat",
    players: [
      ["Dwyane Wade", "dwyane_wade", "SG", [["2005-06", 27.2], ["2008-09", 30.2], ["2009-10", 26.6], ["2012-13", 21.2]]],
      ["LeBron James", "lebron_james_mia", "SF", [["2010-11", 26.7], ["2012-13", 26.8], ["2013-14", 27.1]]],
      ["Shaquille O'Neal", "shaquille_oneal_mia", "C", [["2004-05", 22.9], ["2005-06", 20.0]]],
      ["Alonzo Mourning", "alonzo_mourning_mia", "C", [["1996-97", 17.3], ["1999-2000", 21.7]]],
      ["Jimmy Butler", "jimmy_butler_mia", "SF", [["2019-20", 19.9], ["2021-22", 21.4], ["2022-23", 22.9]]],
      ["Tim Hardaway", "tim_hardaway_mia", "PG", [["1996-97", 20.3], ["1997-98", 18.7]]],
      ["Bam Adebayo", "bam_adebayo_mia", "C", [["2020-21", 18.7], ["2022-23", 20.4]]],
      ["Glen Rice", "glen_rice_mia", "SF", [["1993-94", 17.6], ["1994-95", 22.3]]],
      ["Chris Bosh", "chris_bosh_mia", "PF", [["2010-11", 18.7], ["2013-14", 16.2]]],
    ],
  },
  MIL: {
    team_name: "Milwaukee Bucks",
    players: [
      ["Giannis Antetokounmpo", "giannis_antetokounmpo", "PF", [["2016-17", 22.9], ["2018-19", 27.7], ["2019-20", 29.5], ["2020-21", 28.1], ["2021-22", 29.9], ["2023-24", 30.4]]],
      ["Kareem Abdul-Jabbar", "kareem_abduljabbar_mil", "C", [["1969-70", 28.8], ["1971-72", 34.8], ["1973-74", 27.0]]],
      ["Oscar Robertson", "oscar_robertson_mil", "PG", [["1970-71", 19.4], ["1971-72", 19.0]]],
      ["Sidney Moncrief", "sidney_moncrief", "SG", [["1981-82", 21.8], ["1982-83", 22.5]]],
      ["Ray Allen", "ray_allen_mil", "SG", [["1999-2000", 22.1], ["2000-01", 22.0]]],
      ["Glenn Robinson", "glenn_robinson", "SF", [["1996-97", 21.1], ["1998-99", 23.4]]],
      ["Michael Redd", "michael_redd", "SG", [["2003-04", 21.7], ["2006-07", 26.7]]],
      ["Khris Middleton", "khris_middleton", "SF", [["2018-19", 18.3], ["2019-20", 20.9]]],
    ],
  },
  MIN: {
    team_name: "Minnesota Timberwolves",
    players: [
      ["Kevin Garnett", "kevin_garnett_min", "PF", [["1999-2000", 22.9], ["2000-01", 22.0], ["2003-04", 24.2], ["2004-05", 22.2]]],
      ["Karl-Anthony Towns", "karlanthony_towns", "C", [["2018-19", 24.4], ["2020-21", 24.8], ["2021-22", 24.6]]],
      ["Kevin Love", "kevin_love_min", "PF", [["2010-11", 20.2], ["2013-14", 26.1]]],
      ["Anthony Edwards", "anthony_edwards", "SG", [["2022-23", 24.6], ["2023-24", 25.9], ["2024-25", 27.6]]],
      ["Stephon Marbury", "stephon_marbury", "PG", [["1998-99", 17.7], ["1999-2000", 21.4]]],
      ["Latrell Sprewell", "latrell_sprewell_min", "SG", [["2003-04", 16.8]]],
      ["Sam Cassell", "sam_cassell_min", "PG", [["2004-05", 15.9]]],
      ["Andrew Wiggins", "andrew_wiggins_min", "SF", [["2014-15", 16.9], ["2016-17", 23.6]]],
    ],
  },
  NOP: {
    team_name: "New Orleans Pelicans",
    players: [
      ["Zion Williamson", "zion_williamson", "PF", [["2019-20", 22.5], ["2020-21", 27.0], ["2022-23", 26.0]]],
      ["Anthony Davis", "anthony_davis_nop", "PF", [["2012-13", 13.5], ["2014-15", 24.4], ["2016-17", 28.0], ["2017-18", 28.1]]],
      ["Chris Paul", "chris_paul_nop", "PG", [["2005-06", 16.1], ["2007-08", 21.1], ["2010-11", 15.8]]],
      ["Baron Davis", "baron_davis_noh", "PG", [["2001-02", 18.9]]],
      ["David West", "david_west", "PF", [["2007-08", 20.6], ["2008-09", 18.9]]],
      ["Jrue Holiday", "jrue_holiday_nop", "PG", [["2013-14", 14.3], ["2017-18", 15.4]]],
      ["Brandon Ingram", "brandon_ingram", "SF", [["2019-20", 24.3], ["2020-21", 23.8]]],
      ["Eric Gordon", "eric_gordon_nop", "SG", [["2011-12", 16.9]]],
      ["DeMarcus Cousins", "demarcus_cousins_nop", "C", [["2017-18", 25.2]]],
    ],
  },
  NYK: {
    team_name: "New York Knicks",
    players: [
      ["Patrick Ewing", "patrick_ewing", "C", [["1989-90", 28.6], ["1991-92", 24.0], ["1993-94", 24.5]]],
      ["Willis Reed", "willis_reed", "C", [["1969-70", 21.7], ["1970-71", 20.9]]],
      ["Walt Frazier", "walt_frazier", "PG", [["1971-72", 23.2], ["1972-73", 21.1]]],
      ["Carmelo Anthony", "carmelo_anthony_nyk", "SF", [["2011-12", 22.6], ["2012-13", 28.7], ["2013-14", 27.4]]],
      ["Jalen Brunson", "jalen_brunson", "PG", [["2022-23", 24.0], ["2023-24", 28.7], ["2024-25", 26.4]]],
      ["Bernard King", "bernard_king_nyk", "SF", [["1983-84", 26.3], ["1984-85", 32.9]]],
      ["Allan Houston", "allan_houston", "SG", [["1998-99", 17.7], ["2000-01", 20.9]]],
      ["Julius Randle", "julius_randle_nyk", "PF", [["2020-21", 24.1], ["2021-22", 20.1]]],
    ],
  },
  OKC: {
    team_name: "Oklahoma City Thunder",
    players: [
      ["Shai Gilgeous-Alexander", "shai_gilgeousalexander", "PG", [["2020-21", 23.7], ["2021-22", 24.5], ["2022-23", 31.4], ["2023-24", 30.1], ["2024-25", 32.7]]],
      ["Kevin Durant", "kevin_durant_okc", "SF", [["2009-10", 30.1], ["2010-11", 27.7], ["2012-13", 28.1], ["2013-14", 32.0]]],
      ["Russell Westbrook", "russell_westbrook_okc", "PG", [["2013-14", 21.8], ["2015-16", 23.5], ["2016-17", 31.6]]],
      ["James Harden", "james_harden_okc", "SG", [["2011-12", 16.8]]],
      ["Gary Payton", "gary_payton_sea", "PG", [["1993-94", 16.5], ["1997-98", 19.2]]],
      ["Shawn Kemp", "shawn_kemp_sea", "PF", [["1993-94", 18.1], ["1995-96", 19.6]]],
      ["Jack Sikma", "jack_sikma_sea", "C", [["1979-80", 15.6], ["1981-82", 16.3]]],
    ],
  },
  ORL: {
    team_name: "Orlando Magic",
    players: [
      ["Shaquille O'Neal", "shaquille_oneal_orl", "C", [["1992-93", 23.4], ["1993-94", 29.3], ["1994-95", 29.3]]],
      ["Dwight Howard", "dwight_howard_orl", "C", [["2007-08", 20.7], ["2008-09", 20.6], ["2009-10", 18.3]]],
      ["Tracy McGrady", "tracy_mcgrady_orl", "SG", [["2000-01", 26.8], ["2002-03", 32.1]]],
      ["Penny Hardaway", "penny_hardaway", "PG", [["1995-96", 21.7], ["1996-97", 20.5]]],
      ["Paolo Banchero", "paolo_banchero", "PF", [["2022-23", 20.0], ["2023-24", 22.6]]],
      ["Nick Anderson", "nick_anderson", "SG", [["1993-94", 16.6]]],
      ["Hedo Turkoglu", "hedo_turkoglu_orl", "SF", [["2007-08", 19.5], ["2008-09", 20.6]]],
    ],
  },
  PHI: {
    team_name: "Philadelphia 76ers",
    players: [
      ["Wilt Chamberlain", "wilt_chamberlain_phi", "C", [["1965-66", 33.5], ["1966-67", 24.1]]],
      ["Julius Erving", "julius_erving_phi", "SF", [["1976-77", 21.6], ["1980-81", 24.6], ["1982-83", 21.4]]],
      ["Allen Iverson", "allen_iverson_phi", "SG", [["1999-2000", 28.4], ["2000-01", 31.1], ["2001-02", 31.4], ["2005-06", 33.0]]],
      ["Charles Barkley", "charles_barkley_phi", "PF", [["1988-89", 25.8], ["1989-90", 25.2], ["1990-91", 27.6]]],
      ["Joel Embiid", "joel_embiid", "C", [["2018-19", 27.5], ["2019-20", 23.0], ["2021-22", 30.6], ["2022-23", 33.1]]],
      ["Moses Malone", "moses_malone_phi", "C", [["1982-83", 24.5], ["1984-85", 24.6]]],
      ["Hal Greer", "hal_greer", "SG", [["1966-67", 22.1], ["1968-69", 24.1]]],
      ["Ben Simmons", "ben_simmons_phi", "PG", [["2017-18", 15.8], ["2019-20", 16.4]]],
    ],
  },
  PHX: {
    team_name: "Phoenix Suns",
    players: [
      ["Steve Nash", "steve_nash_phx", "PG", [["2004-05", 15.5], ["2006-07", 18.6], ["2007-08", 16.9]]],
      ["Charles Barkley", "charles_barkley_phx", "PF", [["1992-93", 25.6], ["1993-94", 21.6]]],
      ["Devin Booker", "devin_booker", "SG", [["2018-19", 26.6], ["2021-22", 26.8], ["2022-23", 27.8], ["2023-24", 27.1]]],
      ["Amar'e Stoudemire", "amare_stoudemire", "PF", [["2004-05", 26.0], ["2007-08", 25.2]]],
      ["Kevin Johnson", "kevin_johnson", "PG", [["1989-90", 22.5], ["1993-94", 20.9]]],
      ["Walter Davis", "walter_davis", "SG", [["1978-79", 24.2], ["1979-80", 23.6]]],
      ["Kevin Durant", "kevin_durant_phx", "SF", [["2023-24", 27.1], ["2024-25", 26.6]]],
      ["Alvan Adams", "alvan_adams", "C", [["1975-76", 19.0], ["1977-78", 18.0]]],
    ],
  },
  POR: {
    team_name: "Portland Trail Blazers",
    players: [
      ["Damian Lillard", "damian_lillard_por", "PG", [["2015-16", 25.1], ["2017-18", 26.9], ["2019-20", 30.0], ["2020-21", 28.8]]],
      ["Clyde Drexler", "clyde_drexler_por", "SG", [["1987-88", 27.0], ["1991-92", 25.0]]],
      ["Bill Walton", "bill_walton_por", "C", [["1976-77", 18.6], ["1977-78", 18.9]]],
      ["Terry Porter", "terry_porter", "PG", [["1990-91", 17.0]]],
      ["Rasheed Wallace", "rasheed_wallace_por", "PF", [["1999-2000", 16.4]]],
      ["LaMarcus Aldridge", "lamarcus_aldridge", "PF", [["2010-11", 21.8], ["2013-14", 23.2]]],
      ["CJ McCollum", "cj_mccollum", "SG", [["2015-16", 20.8], ["2018-19", 21.0]]],
      ["Jerome Kersey", "jerome_kersey", "SF", [["1987-88", 19.2]]],
    ],
  },
  SAC: {
    team_name: "Sacramento Kings",
    players: [
      ["De'Aaron Fox", "deaaron_fox", "PG", [["2020-21", 25.2], ["2022-23", 25.0], ["2023-24", 26.6]]],
      ["DeMarcus Cousins", "demarcus_cousins", "C", [["2013-14", 22.7], ["2015-16", 26.9]]],
      ["Chris Webber", "chris_webber_sac", "PF", [["1999-2000", 24.5], ["2000-01", 27.1]]],
      ["Mitch Richmond", "mitch_richmond", "SG", [["1993-94", 23.4], ["1996-97", 25.7]]],
      ["Oscar Robertson", "oscar_robertson_cin", "PG", [["1961-62", 30.8], ["1963-64", 31.4]]],
      ["Peja Stojakovic", "peja_stojakovic_sac", "SF", [["2003-04", 24.2]]],
      ["Domantas Sabonis", "domantas_sabonis_sac", "PF", [["2022-23", 19.1], ["2023-24", 19.4]]],
    ],
  },
  SAS: {
    team_name: "San Antonio Spurs",
    players: [
      ["Tim Duncan", "tim_duncan", "PF", [["1997-98", 21.1], ["2001-02", 25.5], ["2002-03", 23.3]]],
      ["David Robinson", "david_robinson", "C", [["1993-94", 29.8], ["1994-95", 27.6]]],
      ["Tony Parker", "tony_parker", "PG", [["2006-07", 18.6], ["2008-09", 22.0]]],
      ["Manu Ginobili", "manu_ginobili", "SG", [["2004-05", 16.0], ["2007-08", 19.5]]],
      ["George Gervin", "george_gervin", "SG", [["1979-80", 33.1], ["1981-82", 32.3]]],
      ["Kawhi Leonard", "kawhi_leonard_sas", "SF", [["2015-16", 21.2], ["2016-17", 25.5]]],
      ["Victor Wembanyama", "victor_wembanyama", "C", [["2023-24", 21.4], ["2024-25", 24.3]]],
    ],
  },
  TOR: {
    team_name: "Toronto Raptors",
    players: [
      ["Kyle Lowry", "kyle_lowry_tor", "PG", [["2016-17", 22.4], ["2017-18", 16.2]]],
      ["DeMar DeRozan", "demar_derozan_tor", "SG", [["2016-17", 27.3], ["2017-18", 23.0]]],
      ["Vince Carter", "vince_carter_tor", "SG", [["1999-2000", 25.7], ["2000-01", 27.6]]],
      ["Chris Bosh", "chris_bosh_tor", "PF", [["2006-07", 22.6], ["2009-10", 24.0]]],
      ["Pascal Siakam", "pascal_siakam_tor", "PF", [["2019-20", 22.9], ["2021-22", 22.8]]],
      ["Kawhi Leonard", "kawhi_leonard_tor", "SF", [["2018-19", 26.6]]],
      ["Jonas Valanciunas", "jonas_valanciunas_tor", "C", [["2014-15", 12.0], ["2016-17", 12.8]]],
    ],
  },
  UTA: {
    team_name: "Utah Jazz",
    players: [
      ["John Stockton", "john_stockton", "PG", [["1988-89", 14.7], ["1993-94", 12.6]]],
      ["Karl Malone", "karl_malone_uta", "PF", [["1989-90", 31.0], ["1996-97", 27.4], ["1998-99", 23.8]]],
      ["Donovan Mitchell", "donovan_mitchell_uta", "SG", [["2018-19", 23.8], ["2019-20", 24.0], ["2020-21", 26.4]]],
      ["Adrian Dantley", "adrian_dantley_uta", "SF", [["1981-82", 30.7], ["1983-84", 30.6]]],
      ["Pete Maravich", "pete_maravich_noj", "PG", [["1977-78", 27.0]]],
      ["Rudy Gobert", "rudy_gobert_uta", "C", [["2016-17", 12.8], ["2018-19", 15.9]]],
      ["Deron Williams", "deron_williams", "PG", [["2007-08", 18.8], ["2009-10", 18.7]]],
    ],
  },
  WAS: {
    team_name: "Washington Wizards",
    players: [
      ["Wes Unseld", "wes_unseld", "C", [["1969-70", 13.8], ["1972-73", 13.9]]],
      ["Elvin Hayes", "elvin_hayes_was", "PF", [["1972-73", 21.2], ["1974-75", 23.0]]],
      ["Walt Bellamy", "walt_bellamy", "C", [["1961-62", 31.6]]],
      ["Gilbert Arenas", "gilbert_arenas", "SG", [["2004-05", 25.5], ["2005-06", 29.3], ["2006-07", 28.4]]],
      ["John Wall", "john_wall", "PG", [["2016-17", 23.1], ["2017-18", 19.4]]],
      ["Bradley Beal", "bradley_beal", "SG", [["2018-19", 25.6], ["2019-20", 30.5], ["2020-21", 31.3]]],
      ["Caron Butler", "caron_butler_was", "SF", [["2006-07", 20.7], ["2007-08", 19.1]]],
    ],
  },
};

// This static file is a hand-curated ~7-10-players-per-team sample used
// only as a fallback when the live team-players endpoint (services/api's
// nba_api-backed /api/arena/team-players/{abbr}, see
// services/arena-realtime/src/data/teamPlayersCache.js) is slow or
// unreachable. It is NOT exhaustive for any franchise, so data_complete is
// false across the board -- that's the honest signal for "this needs a live
// fetch (or more manual entries) to be a real full history," not a claim
// that any team here is done.
const output = {};
for (const [abbr, { team_name, players }] of Object.entries(TEAMS)) {
  output[abbr] = {
    team_name,
    data_complete: false,
    players: players.map(([name, player_id, position, seasons]) => ({
      name,
      player_id,
      seasons: seasons.map(([season, ppg]) => ({ season, ppg, position })),
    })),
  };
}

const targets = [
  path.resolve(__dirname, "../src/data/nba_player_seasons.json"),
];
for (const target of targets) {
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
  const teamCount = Object.keys(output).length;
  const playerCount = Object.values(output).reduce((sum, t) => sum + t.players.length, 0);
  const seasonCount = Object.values(output).reduce(
    (sum, t) => sum + t.players.reduce((s, p) => s + p.seasons.length, 0),
    0
  );
  console.log(`wrote ${teamCount} teams, ${playerCount} players, ${seasonCount} seasons to ${target}`);
}
