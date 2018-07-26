import { get as _get } from 'request'
import {
	NPMCountResponseBody,
	Packages,
	DistributionTarget,
	EtherscanResponseBody,
	PackagesAllData,
	AddressBalance,
	AddressBalanceExtendedPoint
} from './types'
import { all as ThrottleAll } from 'promise-parallel-throttle'

const get = async <T>(url: string) =>
	new Promise<T>((resolve, reject) => {
		_get(
			{
				url,
				json: true
			},
			(err, res) => {
				if (err) {
					return reject(err)
				}
				resolve(res.body)
			}
		)
	})

const getDownloadsCountNPM = async (
	start: string,
	end: string,
	packageName: string
) =>
	get<NPMCountResponseBody>(
		`https://api.npmjs.org/downloads/point/${start}:${end}/${packageName}`
	)

export const getAllDownloadsCountNPM = async (
	start: string,
	end: string,
	packages: Packages
) =>
	Promise.all(packages.map(async pkg => getDownloadsCountNPM(start, end, pkg)))

const getBalanceDev = async (address: string): Promise<AddressBalance> => {
	const res = await get<EtherscanResponseBody>(
		`https://welg1mzug8.execute-api.us-east-1.amazonaws.com/prototype/?address=${address}`
	)
	const balance = parseFloat(`${res.result}`)
	return { address, balance }
}

const getAllBalanceDev = async (addresses: string[]) =>
	ThrottleAll(addresses.map(address => async () => getBalanceDev(address)), {
		maxInProgress: 5
	})

const calcBalancePoint = (
	balance: number,
	endDate: string,
	registerDate: string
) =>
	balance /
	(new Date(endDate).getTime() - new Date(registerDate).getTime()) /
	86400000

export const getAllBalancePointDev = async (
	end: string,
	targets: DistributionTarget[]
) => {
	const results = await getAllBalanceDev(targets.map(tgt => tgt.address))
	const find = (address: string) =>
		targets.find(tgt => tgt.address === address) || { date: end }
	return results.map(result => {
		const { address, balance } = result
		return {
			...result,
			...{
				address,
				balance,
				point: calcBalancePoint(balance, end, find(address).date)
			}
		}
	})
}

export const mergePackageData = (
	npms: NPMCountResponseBody[],
	points: AddressBalanceExtendedPoint[],
	packages: DistributionTarget[]
): PackagesAllData[] =>
	npms.map(npm => {
		const pkg = packages.find(pk => pk.package === npm.package) || {
			address: ''
		}
		const data = points.find(p => p.address === pkg.address) || {
			address: '',
			balance: 0,
			point: 0
		}
		const { address = '', balance = 0, point = 0 } = data
		return { ...npm, ...{ address, balance, point } }
	})

export const calcAllDownloadsCount = (items: NPMCountResponseBody[]) =>
	items.map(item => item.downloads).reduce((prev, current) => prev + current)

export const calcAllPointCount = (items: PackagesAllData[]) =>
	items.map(item => item.point).reduce((prev, current) => prev + current)

const calcDistributionRate = (itemCount: number, totalCount: number) =>
	itemCount / totalCount

const calcDistributionValue = (
	itemCount: number,
	totalCount: number,
	totalDistribution: number
) => totalDistribution * calcDistributionRate(itemCount, totalCount)

const calcDistributionCount = (downloadsCount: number, pointCount: number) =>
	downloadsCount + pointCount

const findPackageDistoributionDetails = (
	name: string,
	allData: PackagesAllData[]
) => allData.find(data => data.package === name)

export const createDistributions = (
	targets: DistributionTarget[],
	allData: PackagesAllData[],
	totalCount: number,
	totalDistribution: number
) =>
	targets.map(item => {
		const detail = findPackageDistoributionDetails(
			item.package,
			allData
		) as PackagesAllData
		const { downloads, balance, point } = detail
		const count = calcDistributionCount(downloads, point)
		const val = {
			value: calcDistributionValue(count, totalCount, totalDistribution),
			count,
			downloads,
			balance,
			point
		}
		return { ...val, ...item }
	})