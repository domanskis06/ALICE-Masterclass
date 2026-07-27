import json
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description='Invariant Mass Histogram data converter')
parser.add_argument('inputdir', type=str, help='Input dir for data')
parser.add_argument('outputdir', type=str, help='Output dir for data')

args = parser.parse_args()

def doconvert(particle, centrality, dataset_nr):
	out_file = {}
	
	if particle == 'k0':
		out_file['xmin'] = 0.2
		out_file['xmax'] = 1.2
	else:
		out_file['xmin'] = 1
		out_file['xmax'] = 2
		
	out_file['bins'] = 800
		
	samples = []
	with open(f'{args.inputdir}/{particle}/dataset{dataset_nr}.txt') as f:
		for line in f:
			samples.append(float(line))
		
	out_file['data'] = samples
	
	with open(f'{args.outputdir}/{centrality}_{particle}.json', 'w') as o:
		json.dump(out_file, o)

particles = ['k0', 'lambda', 'antilambda']
centralities = ['pbpb_000_010', 'pbpb_010_020', 'pbpb_020_030', 'pbpb_030_040', 'pbpb_040_050' ,'pbpb_050_060' ,'pbpb_060_070', 'pbpb_070_080', 'pbpb_080_090']

Path(args.outputdir).mkdir(parents=True, exist_ok=True)

# Convert Pb-Pb data
for part_i, particle in enumerate(particles):
	for cent_i, centrality in enumerate(centralities):
		if particle != 'k0' and (centrality == 'pbpb_080_090'):
			continue
			
		dataset_nr = (part_i+1)*10 + cent_i+1
			
		print(f'Writing {particle} {centrality} {dataset_nr}...')
		
		doconvert(particle, centrality, dataset_nr)

# Convert p-p data
for particle in particles:
	print(f'Writing {particle} pp...')
	doconvert(particle, 'pp', 'pp')
	
print('Done!')