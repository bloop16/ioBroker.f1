// ============================================================
// Jolpica / Ergast API types
// ============================================================

export interface JolpikaRaceSession {
	date: string;
	time?: string;
}

export interface JolpikaRace {
	season: string;
	round: string;
	raceName: string;
	date: string;
	time?: string;
	Circuit: {
		circuitId: string;
		circuitName: string;
		Location: {
			locality: string;
			country: string;
			lat: string;
			long: string;
		};
	};
	FirstPractice?: JolpikaRaceSession;
	SecondPractice?: JolpikaRaceSession;
	ThirdPractice?: JolpikaRaceSession;
	Qualifying?: JolpikaRaceSession;
	Sprint?: JolpikaRaceSession;
	SprintQualifying?: JolpikaRaceSession;
}

export interface JolpikaDriver {
	driverId: string;
	permanentNumber: string;
	code: string;
	givenName: string;
	familyName: string;
	nationality: string;
}

export interface JolpikaConstructor {
	constructorId: string;
	name: string;
	nationality: string;
}

export interface JolpikaDriverStanding {
	position: string;
	positionText: string;
	points: string;
	wins: string;
	Driver: JolpikaDriver;
	Constructors: JolpikaConstructor[];
}

export interface JolpikaConstructorStanding {
	position: string;
	positionText: string;
	points: string;
	wins: string;
	Constructor: JolpikaConstructor;
}

export interface JolpikaRaceResult {
	number: string;
	position: string;
	positionText: string;
	points: string;
	Driver: JolpikaDriver;
	Constructor: JolpikaConstructor;
	grid: string;
	laps: string;
	status: string;
	Time?: { millis: string; time: string };
	FastestLap?: { rank: string; lap: string; Time: { time: string } };
}

export interface JolpikaQualifyingResult {
	number: string;
	position: string;
	Driver: JolpikaDriver;
	Constructor: JolpikaConstructor;
	Q1?: string;
	Q2?: string;
	Q3?: string;
}

// ============================================================
// Internal normalized session types
// ============================================================

export interface FlatSession {
	sessionName: string;
	sessionType: string;
	circuitName: string;
	country: string;
	location: string;
	dateStart: Date;
	dateEnd: Date;
	round: number;
	season: string;
}

export interface WeekendSessions {
	circuit: string;
	country: string;
	location: string;
	year: number;
	sessions: FlatSession[];
	next_session_index: number;
}

// ============================================================
// F1 Live Timing data types (SignalR topics)
// ============================================================

export interface F1WeatherData {
	AirTemp: string;
	Humidity: string;
	Pressure: string;
	Rainfall: string;
	TrackTemp: string;
	WindDirection: string;
	WindSpeed: string;
}

export interface F1SessionStatus {
	Status: string;
}

export interface F1TrackStatus {
	Status: string;
	Message: string;
}

export interface F1LapCount {
	CurrentLap: number;
	TotalLaps: number;
}

export interface F1SessionInfo {
	Meeting?: {
		Name?: string;
		OfficialName?: string;
		Circuit?: { ShortName?: string };
		Country?: { Name?: string };
		Location?: string;
	};
	Name?: string;
	Type?: string;
}

export interface F1DriverEntry {
	RacingNumber?: string;
	BroadcastName?: string;
	FullName?: string;
	Tla?: string;
	TeamName?: string;
	TeamColour?: string;
	FirstName?: string;
	LastName?: string;
	HeadshotUrl?: string;
}

export type F1DriverList = Record<string, F1DriverEntry>;

export interface F1TimingLine {
	Position?: string;
	GapToLeader?: string;
	IntervalToPositionAhead?: { Value?: string };
	LastLapTime?: { Value?: string; PersonalFastest?: boolean };
	BestLapTime?: { Value?: string };
	NumberOfLaps?: number;
	InPit?: boolean;
	PitOut?: boolean;
}

export interface F1TimingData {
	Lines?: Record<string, F1TimingLine>;
}

export interface F1TyreStint {
	Compound?: string;
	New?: string;
	TotalLaps?: number;
	StartLaps?: number;
}

export interface F1TimingAppLine {
	Stints?: Record<string, F1TyreStint>;
}

export interface F1TimingAppData {
	Lines?: Record<string, F1TimingAppLine>;
}

export interface F1PitStop {
	Duration?: string;
	Lap?: number;
}

export interface F1PitStopSeries {
	Lines?: Record<string, Record<string, F1PitStop>>;
}

export interface F1TeamRadioCapture {
	Utc: string;
	RacingNumber: string;
	Path: string;
}

export interface F1TeamRadio {
	Captures?: F1TeamRadioCapture[];
}

export interface F1RaceControlMessage {
	Utc?: string;
	Lap?: number;
	Category?: string;
	Flag?: string;
	Scope?: string;
	Message?: string;
}

export interface F1RaceControlMessages {
	Messages?: Record<string, F1RaceControlMessage>;
}

export interface F1ChampionshipPrediction {
	Drivers?: Record<string, { CurrentPosition: number; Points: number }>;
	Teams?: Record<string, { CurrentPosition: number; Points: number }>;
}
