import argparse
import csv
import json
import sqlite3
from pathlib import Path
from app.config import Settings
from app.db import connect
from app.queries import summary, Filters


def main():
    parser=argparse.ArgumentParser(description='Local database maintenance. No web export is provided.')
    parser.add_argument('action',choices=['stats','backup','unresolved'])
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    path=Settings().db_path
    if args.action=='stats':
        with connect(path,True) as db:
            print(json.dumps(summary(db,Filters()),ensure_ascii=False,indent=2))
    elif args.action=='backup':
        if not args.output or args.output.exists() or args.output.resolve()==path.resolve():
            parser.error('--output must be a new backup file')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(args.output) as target:
            source.backup(target)
        print('Backup completed')
    else:
        if not args.output:
            parser.error('--output is required')
        with connect(path,True) as db:
            rows=db.execute("SELECT province,city,county,COUNT(*) record_count FROM fruit_records WHERE geo_status='unresolved' GROUP BY province,city,county ORDER BY province,county").fetchall()
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('w',encoding='utf-8-sig',newline='') as handle:
            writer=csv.writer(handle);writer.writerow(['province','city','county','record_count']);writer.writerows(rows)
        print(f'{len(rows)} unresolved location groups written locally')


if __name__=='__main__':
    main()
