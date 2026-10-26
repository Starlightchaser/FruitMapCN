import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from app.config import Settings
from app.importers.excel_importer import import_workbook
from app.main import create_app

HEADERS=['水果类目','品种/地方产品名','产地完整名称','省份','市/州','县/区/旗（初步解析）','乡镇/村（原文）','上市月份区间','月份数字（筛选用）','月份依据类型','产地-品种来源','来源URL','记录状态','备注']


@pytest.fixture
def source(tmp_path):
    path=tmp_path/'test.xlsx';book=Workbook();sheet=book.active;sheet.title='水果产地主库';sheet.append(HEADERS)
    sheet.append(['苹果','测试苹果','测试省测试市甲县一村','测试省','测试市','甲县','一村','9–3月（跨年估算）','9,10,11,12,1,2,3','按苹果常见成熟季估算，待核验','测试产地名录','https://example.org/origin','',''])
    sheet.append(['梨','测试梨','测试省测试市甲县二村','测试省','测试市','甲县','二村','全年','1,2,3,4,5,6,7,8,9,10,11,12','已有来源但未核验','月份资料','https://example.org/month','',''])
    sheet.append(['水果（未细分）','待细分水果','另一省乙县','另一省','','乙县','','待补','','待补','名录','https://example.org','',''])
    book.save(path);return path


@pytest.fixture
def database(source,tmp_path):
    path=(tmp_path/'fruit.db').resolve();import_workbook(source,path);return path


@pytest.fixture
def client(database,tmp_path):
    config=Settings(database_url='sqlite:///'+str(database),frontend_dist=tmp_path/'dist',rate_limit=1000)
    with TestClient(create_app(config)) as client:
        yield client
