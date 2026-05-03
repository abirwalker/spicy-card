import Spline from 'cubic-spline'
import { TimeValueRange } from './Types.d'

export const GetSpline = (range: TimeValueRange) => {
	const times = range.map((value) => value.Time)
	const values = range.map((value) => value.Value)
	return new Spline(times, values)
}

export const Clamp = (value: number, min: number, max: number): number => {
	return Math.max(min, Math.min(value, max))
}
